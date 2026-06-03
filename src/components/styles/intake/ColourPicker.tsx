import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { listDistinctColours } from '@/api/styles';

interface Props {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  /** Optional placeholder for the closed-state trigger. */
  placeholder?: string;
  /** When true, the "+ Add" path commits the typed value directly
   *  instead of opening a confirmation Dialog. Used when this picker
   *  is already embedded inside another Dialog (e.g. AddColourModal),
   *  where nested Dialogs would share the window-level Escape handler
   *  and close both on a single Esc. */
  inlineAdd?: boolean;
  /** The chosen fabric's colours. When present they're surfaced first
   *  (with a swatch + "from fabric" hint) as the recommended set — the
   *  product colour usually matches the fabric. Free text is still
   *  allowed (garment-dye / prints / marketing names). */
  fabricColours?: { id: number; name: string; hex: string | null }[];
}

/**
 * Searchable Colour picker for a Style's free-text `primaryColour`.
 * Suggestion sources, in priority order:
 *   1. `fabricColours` (when given) — the chosen fabric's colours, surfaced
 *      first with a swatch; the product colour usually matches the cloth.
 *   2. `GET /api/styles/colours` — distinct `primaryColour` values already
 *      used across existing styles.
 * The committed value is still free text on `Style.primaryColour`; this
 * picker never writes to the Colour master, so an override is always allowed.
 *
 *   - Type-ahead filters the list.
 *   - `+ Add` opens a popup with a Name input prefilled from whatever was
 *     typed (empty-typed click still opens it); submit commits the value.
 */
export default function ColourPicker({
  value,
  onChange,
  disabled,
  placeholder,
  inlineAdd,
  fabricColours,
}: Props) {
  const { t } = useTranslation();
  const [colours, setColours] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [formColour, setFormColour] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;
    listDistinctColours()
      .then((rows) => {
        if (mounted) setColours(rows);
      })
      .catch(() => {
        // Soft-fail: a missing suggestions list shouldn't block intake.
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Options, in priority order:
  //  1. the chosen fabric's colours (recommended; swatch + "from fabric")
  //  2. historical free-text colours + the current value (off-list overrides)
  // Deduped case-insensitively so a fabric colour isn't repeated below.
  const options = useMemo<ComboboxOption<string>[]>(() => {
    const seen = new Set<string>();
    const opts: ComboboxOption<string>[] = [];

    for (const fc of fabricColours ?? []) {
      const key = fc.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      opts.push({
        value: fc.name,
        label: fc.name,
        searchText: fc.name,
        sublabel: t('admin.styles.intake.colourFromFabric', {
          defaultValue: 'from fabric',
        }),
        trailing: (
          <span
            className="h-3 w-3 rounded-full border border-black/10"
            style={{ backgroundColor: fc.hex || fc.name.toLowerCase() }}
          />
        ),
      });
    }

    const rest = new Set<string>(colours);
    if (value) rest.add(value);
    for (const c of Array.from(rest).sort((a, b) => a.localeCompare(b))) {
      if (seen.has(c.toLowerCase())) continue;
      seen.add(c.toLowerCase());
      opts.push({ value: c, label: c, searchText: c });
    }
    // Guarantee the current value is selectable with its EXACT casing.
    // The case-insensitive dedup above can keep a different casing (e.g. a
    // historical lowercase "yellow") and drop the exact value, which makes
    // the Combobox's exact `o.value === value` match fail — so a
    // programmatically-set colour like "Yellow" (from AI vision) would
    // render blank. Prepend it when missing.
    if (value && !opts.some((o) => o.value === value)) {
      opts.unshift({ value, label: value, searchText: value });
    }
    return opts;
  }, [colours, value, fabricColours, t]);

  const commit = (raw: string) => {
    const v = raw.trim();
    if (!v) return;
    // Keep the local suggestions in sync so the new value sticks
    // around for this session even before the server-side list
    // refreshes on the next mount.
    setColours((cs) => (cs.includes(v) ? cs : [...cs, v]));
    onChange(v);
    setModalOpen(false);
    setFormColour('');
  };

  return (
    <>
      <Combobox<string>
        value={value || null}
        options={options}
        onChange={(next) => onChange(next ?? '')}
        onAddNew={(typed) => {
          // When embedded in another Dialog (inlineAdd=true), commit
          // the typed value directly — nested Dialogs share the
          // window-level Escape handler and would close the host
          // modal on a single Esc.
          if (inlineAdd) {
            const v = typed.trim();
            if (v) commit(v);
            return;
          }
          // Open a popup whether or not the user has typed anything.
          // Previously empty-typed was a no-op which felt broken —
          // matches CategoryPicker / FabricPicker behaviour now.
          setFormColour(typed.trim());
          setModalOpen(true);
        }}
        addNewLabel={t('admin.styles.intake.addColour', 'Add colour')}
        placeholder={
          placeholder ?? t('admin.styles.intake.colourPh', 'Type or pick a colour')
        }
        disabled={disabled}
        ariaLabel={t('admin.styles.intake.primaryColour', 'Primary colour')}
      />

      <Dialog
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setFormColour('');
        }}
        title={t('admin.styles.intake.newColourTitle', 'New colour')}
        initialFocusRef={inputRef}
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setModalOpen(false);
                setFormColour('');
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              size="sm"
              disabled={!formColour.trim()}
              onClick={() => commit(formColour)}
            >
              {t('common.create', 'Create')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-[12px] text-[var(--color-muted-foreground)]">
            {t(
              'admin.styles.intake.newColourHelp',
              "Free text — colour names aren't standardised. Earlier picks autocomplete.",
            )}
          </p>
          <div>
            <Label>
              {t('admin.styles.intake.colourLabel', 'Colour name *')}
            </Label>
            <Input
              ref={inputRef}
              value={formColour}
              onChange={(e) => setFormColour(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && formColour.trim()) {
                  e.preventDefault();
                  commit(formColour);
                }
              }}
              placeholder="e.g. Sage Green"
            />
          </div>
        </div>
      </Dialog>
    </>
  );
}
