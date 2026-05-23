import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { addInspection } from '@/api/styles';
import type { InspectionVerdict, StyleInspection } from '@/api/types';

interface Props {
  styleId: number;
  inspections: StyleInspection[];
  onAdded?: () => void;
}

function verdictVariant(v: InspectionVerdict) {
  if (v === 'approved') return 'success';
  if (v === 'corrections_needed') return 'warning';
  return 'outline';
}

const VERDICTS: InspectionVerdict[] = [
  'pending',
  'corrections_needed',
  'approved',
];

export default function InspectionTimeline({
  styleId,
  inspections,
  onAdded,
}: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [verdict, setVerdict] = useState<InspectionVerdict>('pending');
  const [busy, setBusy] = useState(false);

  const sorted = [...inspections].sort((a, b) => b.roundNo - a.roundNo);

  const submit = async () => {
    if (!remarks.trim()) return;
    setBusy(true);
    try {
      await addInspection(styleId, { remarks: remarks.trim(), verdict });
      setRemarks('');
      setVerdict('pending');
      setAdding(false);
      toast.show('Inspection round added.', 'success');
      onAdded?.();
    } catch {
      toast.show('Could not add round.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {sorted.length === 0 && !adding && (
        <p className="text-sm text-[var(--color-muted-foreground)]">
          No inspection rounds yet.
        </p>
      )}

      <ol className="space-y-2">
        {sorted.map((insp) => (
          <li
            key={insp.id}
            className="border border-[var(--color-border)] rounded-[var(--radius-md)] p-3 bg-[var(--color-surface)]"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline">v{insp.roundNo}</Badge>
                <Badge variant={verdictVariant(insp.verdict)}>
                  {t(`admin.styles.verdict.${insp.verdict}`)}
                </Badge>
                {insp.inspector && (
                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    {insp.inspector.name}
                  </span>
                )}
              </div>
              <span className="text-xs text-[var(--color-muted-foreground)] tabular-nums">
                {new Date(insp.inspectedAt).toLocaleDateString()}
              </span>
            </div>
            <p className="text-sm mt-2 whitespace-pre-wrap">{insp.remarks}</p>
          </li>
        ))}
      </ol>

      {!adding && (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus size={14} />
          <span className="ml-1">{t('admin.styles.workspace.addRound')}</span>
        </Button>
      )}

      {adding && (
        <div className="border border-[var(--color-border)] rounded-[var(--radius-md)] p-3 bg-[var(--color-surface-2)] space-y-2">
          <div>
            <Label>Remarks</Label>
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={3}
              placeholder="Inspection findings, corrections needed, etc."
              autoFocus
            />
          </div>
          <div>
            <Label>Verdict</Label>
            <Select
              value={verdict}
              onChange={(e) => setVerdict(e.target.value as InspectionVerdict)}
            >
              {VERDICTS.map((v) => (
                <option key={v} value={v}>
                  {t(`admin.styles.verdict.${v}`)}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                setAdding(false);
                setRemarks('');
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={busy || !remarks.trim()}
              onClick={() => void submit()}
            >
              {busy ? 'Saving…' : 'Save round'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
