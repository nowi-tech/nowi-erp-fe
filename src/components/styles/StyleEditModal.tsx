import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';

import StyleIntakeForm, {
  type StyleIntakeFormHandle,
} from '@/components/styles/StyleIntakeForm';

import { listFabrics, patchStyle } from '@/api/styles';
import { listCategories } from '@/api/categories';
import type {
  CategoryWithStyleCode,
  Fabric,
  Gender,
  Style,
} from '@/api/types';

interface Props {
  open: boolean;
  style: Style | null;
  onClose: () => void;
  onSaved: (saved: Style) => void;
}

/**
 * Edit-mode wrapper around the shared `<StyleIntakeForm>` — opens
 * the exact same form the `/styles/new` page renders, just inside a
 * centered Dialog with a simpler footer (Cancel + Save) instead of
 * the page's sticky breadcrumb / source toggle / reviewer card.
 *
 * Replaces the old StyleQuickEditDrawer for the workspace + China
 * Import edit paths so users see one form, not two divergent
 * variants.
 *
 * The fabric + category masters are loaded lazily on first open;
 * once cached they're reused across reopens.
 */
export default function StyleEditModal({
  open,
  style,
  onClose,
  onSaved,
}: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const formRef = useRef<StyleIntakeFormHandle>(null);
  const [valid, setValid] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fabrics, setFabrics] = useState<Fabric[]>([]);
  const [categories, setCategories] = useState<CategoryWithStyleCode[]>([]);
  // Mirror gender for the reviewer label only — the form is the
  // authoritative source for the field itself.
  const [genderForReviewer, setGenderForReviewer] = useState<Gender>('women');

  // Lazy-load master data the first time the modal opens.
  useEffect(() => {
    if (!open) return;
    if (fabrics.length === 0) {
      void listFabrics()
        .then(setFabrics)
        .catch(() => setFabrics([]));
    }
    if (categories.length === 0) {
      void listCategories()
        .then(setCategories)
        .catch(() => setCategories([]));
    }
  }, [open, fabrics.length, categories.length]);

  // Reset transient state on every open so the previous attempt's
  // error doesn't bleed into the new session.
  useEffect(() => {
    if (open) setErr(null);
  }, [open]);

  if (!style) return null;

  // Edit modal never toggles source — it's pinned to whatever the
  // style was created under.
  const source = style.source;
  const patternMasterRoleLabel =
    source === 'china_import'
      ? t('admin.styles.intake.reviewerRoleChina')
      : genderForReviewer === 'men'
        ? t('admin.styles.intake.reviewerRoleM')
        : t('admin.styles.intake.reviewerRoleW');
  const patternMasterName =
    source === 'china_import'
      ? t('admin.styles.intake.reviewerDheeraj')
      : genderForReviewer === 'men'
        ? t('admin.styles.intake.reviewerPradyuman')
        : t('admin.styles.intake.reviewerParul');

  const onSave = async () => {
    if (!valid) {
      setErr(t('admin.styles.intake.needsName'));
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const saved = await formRef.current?.submit();
      if (!saved) return;
      toast.show(
        t('admin.styles.drawer.updatedToast', { defaultValue: 'Saved.' }),
        'success',
      );
      onSaved(saved);
      onClose();
    } catch (e: unknown) {
      const m =
        (e as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message ?? t('admin.styles.intake.saveError');
      setErr(Array.isArray(m) ? m.join(', ') : String(m));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidthClassName="max-w-4xl"
      title={
        <span className="font-serif text-lg">
          {style.styleId ? (
            <>
              <span className="font-mono mr-2">{style.styleId}</span>
              <span className="text-[var(--color-muted-foreground)] text-sm">
                {style.workingName ?? ''}
              </span>
            </>
          ) : (
            (style.workingName ??
              t('admin.styles.drawer.newStyle', {
                defaultValue: 'New style',
              }))
          )}
        </span>
      }
      footer={
        <>
          {err && (
            <span className="mr-auto text-xs text-[var(--status-stuck-ink)] truncate">
              {err}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={onClose}
          >
            {t('common.cancel')}
          </Button>
          <Button
            size="sm"
            disabled={saving || !valid}
            onClick={() => void onSave()}
          >
            {saving
              ? t('common.saving')
              : t('admin.styles.drawer.save', { defaultValue: 'Save' })}
          </Button>
        </>
      }
    >
      <StyleIntakeForm
        ref={formRef}
        source={source}
        style={style}
        patternMasterName={patternMasterName}
        patternMasterRoleLabel={patternMasterRoleLabel}
        fabrics={fabrics}
        categories={categories}
        onFabricsChanged={setFabrics}
        onCategoriesChanged={setCategories}
        onValidityChange={setValid}
        onGenderChange={setGenderForReviewer}
        onSaved={() => {
          /* navigate / refresh handled by `onSaved` prop on this modal */
        }}
        apiCall={(payload) =>
          patchStyle(
            style.id,
            payload as Parameters<typeof patchStyle>[1],
          )
        }
      />
    </Dialog>
  );
}
