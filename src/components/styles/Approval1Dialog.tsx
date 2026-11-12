import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { getFabric, getStyle, type ApproveStyleBody } from '@/api/styles';
import type { Fabric, FabricColour, Style } from '@/api/types';
import { fmtQty, styleFabricColour } from '@/lib/fabric';
import { cn } from '@/lib/utils';

/**
 * Approval #1 confirmation dialog — shows the fabric's stock (a fact,
 * not a tick), the approver confirms price OK / collection fit, and
 * optionally records a note.
 *
 * The BE now auto-sets `samplingStatus = Pattern dev` on approval, so
 * this dialog no longer asks for an initial sampling status; Pattern
 * Master has also been dropped entirely.
 *
 * Used both from the detail page (StyleWorkspace) and from the
 * Sampling registry's inline Approve action. Lifted out of
 * StyleWorkspace so the inline-approve flow gets the same disciplined
 * checklist instead of firing an empty body.
 */

interface Props {
  open: boolean;
  busy: boolean;
  gender: Style['gender'];
  /** The style being approved — its fabric's stock is shown instead of a hand-ticked "fabric feasible". */
  styleId: number | null;
  onClose: () => void;
  onConfirm: (body: ApproveStyleBody) => void;
}

export default function Approval1Dialog({
  open,
  busy,
  gender,
  styleId,
  onClose,
  onConfirm,
}: Props) {
  const { t } = useTranslation();
  // Approver context is conveyed by the style's gender; retained as a
  // prop so callers stay in sync with the BE's gender-routed approver.
  void gender;
  // One "I confirm" tick covers price and collection; all three booleans are
  // still sent so the BE's record keeps its shape.
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState('');

  const [stock, setStock] = useState<
    { fabric: Fabric; colour?: FabricColour; styleColour: string | null } | null | 'none' | 'error'
  >(null);

  // Reset the checklist each time the dialog opens.
  useEffect(() => {
    if (open) {
      setConfirmed(false);
      setNote('');
    }
  }, [open]);

  // Fabric is a fact from stock, not something the approver vouches for.
  useEffect(() => {
    setStock(null);
    if (!open || styleId == null) return;
    let live = true;
    void getStyle(styleId)
      .then(async (st) => {
        if (!st.fabricId) {
          if (live) setStock('none');
          return;
        }
        const f = await getFabric(st.fabricId);
        if (live) setStock({ fabric: f, colour: styleFabricColour(f, st.primaryColour), styleColour: st.primaryColour });
      })
      .catch(() => {
        if (live) setStock('error');
      });
    return () => {
      live = false;
    };
  }, [open, styleId]);

  const stockLine = (() => {
    if (stock === 'none') {
      return { text: t('admin.styles.approval1.noFabric', { defaultValue: 'Fabric: not picked yet' }), tone: 'muted' as const };
    }
    if (stock === 'error') {
      return { text: t('admin.styles.approval1.stockError', { defaultValue: "Couldn't load fabric stock." }), tone: 'muted' as const };
    }
    if (!stock) return null;
    const { fabric, colour, styleColour } = stock;
    const unit = fabric.unitOfMeasure;
    // Another colour's stock is not this style's stock.
    if (!colour && (fabric.colours?.length ?? 0) > 0) {
      return {
        text: styleColour
          ? t('admin.styles.approval1.colourMissing', {
              defaultValue: '{{fabric}} · {{colour}} not in the library',
              fabric: fabric.name,
              colour: styleColour,
            })
          : t('admin.styles.approval1.colourUnset', {
              defaultValue: '{{fabric}} · style colour not set',
              fabric: fabric.name,
            }),
        tone: 'bad' as const,
      };
    }
    const have = colour
      ? colour.availableQuantity ?? 0
      : (fabric.colours ?? []).reduce((s, c) => s + (c.availableQuantity ?? 0), 0);
    const name = colour ? `${fabric.name} · ${colour.name}` : fabric.name;
    const onOrder = colour?.onOrderQuantity ?? 0;
    const coming =
      onOrder > 0
        ? ` · ${
            colour?.nextExpectedDate
              ? t('admin.styles.approval1.onOrderDue', {
                  defaultValue: '{{qty}} on order, due {{date}}',
                  qty: fmtQty(onOrder, unit),
                  date: new Date(colour.nextExpectedDate).toLocaleDateString(),
                })
              : t('admin.styles.approval1.onOrder', { defaultValue: '{{qty}} on order', qty: fmtQty(onOrder, unit) })
          }`
        : '';
    return have > 0
      ? {
          text: `${name}: ${t('admin.fabric.inStock', { defaultValue: '{{qty}} in stock', qty: fmtQty(have, unit) })}${coming}`,
          tone: 'ok' as const,
        }
      : { text: `${name}: ${t('admin.styles.approval1.outOfStock', { defaultValue: 'out of stock' })}${coming}`, tone: 'bad' as const };
  })();

  // The single confirmation must be ticked before Confirm enables —
  // policy reason for extracting the dialog: inline Approve used to
  // fire an empty body with no checks recorded.
  const canConfirm = confirmed && !busy;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('admin.styles.approval1.dialogTitle')}
      footer={
        <>
          <Button variant="outline" size="sm" disabled={busy} onClick={onClose}>
            {t('admin.styles.approval1.cancel')}
          </Button>
          <Button
            size="sm"
            disabled={!canConfirm}
            onClick={() =>
              onConfirm({
                // Fabric was shown from stock above; the BE field keeps its shape.
                approval1FabricFeasible: true,
                approval1PriceOk: true,
                approval1CollectionFit: true,
                approval1Note: note.trim() || undefined,
              })
            }
          >
            {/* In-flight feedback: spinner + "Approving…" so the click is
                visibly acknowledged instead of looking frozen. */}
            {busy ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <CheckCircle2 size={14} />
            )}
            <span className="ml-1">
              {busy
                ? t('admin.styles.approval1.approving', {
                    defaultValue: 'Approving…',
                  })
                : t('admin.styles.approval1.confirm')}
            </span>
          </Button>
        </>
      }
    >
      <p className="text-sm text-[var(--color-muted-foreground)] mb-4">
        {t('admin.styles.approval1.dialogIntro')}
      </p>

      {stockLine && (
        <p
          className={cn(
            'mb-3 rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium',
            stockLine.tone === 'ok' && 'bg-[var(--status-ready-bg)] text-[var(--status-ready-ink)]',
            stockLine.tone === 'bad' && 'bg-[var(--status-stuck-bg)] text-[var(--status-stuck-ink)]',
            stockLine.tone === 'muted' && 'bg-[var(--color-surface-2)] text-[var(--color-muted-foreground)]',
          )}
        >
          {stockLine.text}
        </p>
      )}

      <ul className="mb-3 space-y-1.5 text-sm text-[var(--color-foreground-2)] list-disc pl-5">
        <li>{t('admin.styles.approval1.priceOk')}</li>
        <li>{t('admin.styles.approval1.collectionFit')}</li>
      </ul>

      <CheckboxRow
        label={t('admin.styles.approval1.confirmBoth', {
          defaultValue: 'I have verified both checks pass.',
        })}
        checked={confirmed}
        onChange={setConfirmed}
      />

      <div className="mt-4">
        <label className="block text-xs text-[var(--color-muted-foreground)] mb-1">
          {t('admin.styles.approval1.note')}
        </label>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('admin.styles.approval1.notePlaceholder')}
        />
      </div>
    </Dialog>
  );
}

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 cursor-pointer hover:bg-[var(--color-surface-2)]/40">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-[var(--color-primary)]"
      />
      <span className="text-sm">{label}</span>
    </label>
  );
}
