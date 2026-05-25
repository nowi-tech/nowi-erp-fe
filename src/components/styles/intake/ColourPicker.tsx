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
}

/**
 * Searchable Colour picker. Suggestions come from `GET /api/styles/colours`
 * (distinct `primaryColour` values across existing styles). There is no
 * master table — `primaryColour` is free text on Style.
 *
 * UX matches CategoryPicker / FabricPicker:
 *   - Type-ahead filters the suggestions list
 *   - `+ Add` always opens a popup with a Name input prefilled from
 *     whatever was typed (or empty when none). Submit commits the value.
 *     Empty-typed click also opens the popup (used to be a no-op).
 */
export default function ColourPicker({
  value,
  onChange,
  disabled,
  placeholder,
  inlineAdd,
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

  // Combine the server list with the currently-selected value so an
  // off-list colour (just-added or imported) still shows as selected
  // in the closed trigger.
  const options = useMemo<ComboboxOption<string>[]>(() => {
    const set = new Set<string>(colours);
    if (value) set.add(value);
    return Array.from(set)
      .sort((a, b) => a.localeCompare(b))
      .map((c) => ({ value: c, label: c, searchText: c }));
  }, [colours, value]);

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
