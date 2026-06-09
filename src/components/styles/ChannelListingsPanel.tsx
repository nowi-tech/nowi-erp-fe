import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { updateChannel } from '@/api/styles';
import type { ChannelName, ChannelState, StyleChannelListing } from '@/api/types';

const CHANNELS: ChannelName[] = [
  'myntra',
  'nykaa',
  'nowi_shopify',
  'amazon',
  'other',
];
const STATES: ChannelState[] = ['off', 'draft', 'live'];

interface Props {
  styleId: number;
  listings: StyleChannelListing[];
  onChanged?: () => void;
}

function stateBadgeVariant(s: ChannelState) {
  if (s === 'live') return 'success';
  if (s === 'draft') return 'warning';
  return 'outline';
}

/**
 * State-only — no API push to Myntra / Nykaa / Shopify (decision #5).
 * Per-row inline edit: state pill + virtual-inventory qty.
 */
export default function ChannelListingsPanel({
  styleId,
  listings,
  onChanged,
}: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState<ChannelName | null>(null);

  const byChannel = new Map(listings.map((l) => [l.channel, l]));

  const save = async (
    channel: ChannelName,
    patch: Partial<StyleChannelListing>,
  ) => {
    setBusy(channel);
    try {
      await updateChannel(styleId, channel, patch);
      onChanged?.();
    } catch {
      toast.show('Could not update channel.', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead className="text-[var(--color-muted-foreground)] text-xs">
          <tr>
            <th className="text-left font-medium px-2 py-1.5">Channel</th>
            <th className="text-left font-medium px-2 py-1.5">State</th>
            <th className="text-left font-medium px-2 py-1.5">
              {t('admin.styles.channel.qty')}
            </th>
            <th />
          </tr>
        </thead>
        <tbody>
          {CHANNELS.map((c) => {
            const l = byChannel.get(c);
            const state = (l?.state ?? 'off') as ChannelState;
            const qty = l?.virtualInventoryQty ?? '';
            return (
              <tr
                key={c}
                className="border-t border-[var(--color-border)]"
              >
                <td className="px-2 py-2 font-medium">
                  {t(`admin.styles.channel.${c}`)}
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={stateBadgeVariant(state)}>
                      {t(`admin.styles.channel.state.${state}`)}
                    </Badge>
                    <Select
                      className="h-8 text-xs w-28"
                      value={state}
                      disabled={busy === c}
                      onChange={(e) =>
                        void save(c, { state: e.target.value as ChannelState })
                      }
                    >
                      {STATES.map((s) => (
                        <option key={s} value={s}>
                          {t(`admin.styles.channel.state.${s}`)}
                        </option>
                      ))}
                    </Select>
                  </div>
                </td>
                <td className="px-2 py-2">
                  <QtyCell
                    initial={qty}
                    disabled={busy === c}
                    onSave={(n) => void save(c, { virtualInventoryQty: n })}
                  />
                </td>
                <td className="px-2 py-2 text-xs text-[var(--color-muted-foreground)]">
                  {l?.notes ?? ''}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function QtyCell({
  initial,
  disabled,
  onSave,
}: {
  initial: number | '';
  disabled: boolean;
  onSave: (qty: number | null) => void;
}) {
  const [v, setV] = useState<string>(initial === '' ? '' : String(initial));
  const [dirty, setDirty] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        min={0}
        className="h-8 w-24 text-xs"
        value={v}
        disabled={disabled}
        onChange={(e) => {
          setV(e.target.value);
          setDirty(true);
        }}
      />
      {dirty && (
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => {
            onSave(v === '' ? null : Number(v));
            setDirty(false);
          }}
        >
          Save
        </Button>
      )}
    </div>
  );
}
