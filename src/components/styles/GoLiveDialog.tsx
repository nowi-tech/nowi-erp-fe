import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Rocket } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ChannelName, StyleChannelListing } from '@/api/types';
import type { GoLiveChannel } from '@/api/styles';

// Channels the go-live dialog can publish to. `nowi_shopify` first since it's
// the owned storefront; the marketplaces follow. Sourced from the BE
// ChannelName enum — add new channels here when they go live.
export const GO_LIVE_CHANNELS: ChannelName[] = [
  'nowi_shopify',
  'myntra',
  'nykaa',
  'amazon',
  'other',
];

/**
 * Shared go-live dialog — the single go-live control used by BOTH the Style
 * workspace and the dashboard Cataloguing tab (so the two can't diverge).
 * Pick one or more channels and (optionally) paste the public listing URL for
 * each, then flip the style to `live` via the `goLive` endpoint. At least one
 * channel must be selected; URLs are optional per channel.
 */
export default function GoLiveDialog({
  open,
  busy,
  existing,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  existing: StyleChannelListing[];
  onClose: () => void;
  onConfirm: (channels: GoLiveChannel[]) => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Set<ChannelName>>(new Set());
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      // Pre-seed from any existing listing URLs so re-opening is non-destructive.
      const seedUrls: Record<string, string> = {};
      for (const l of existing) {
        if (l.listingUrl) seedUrls[l.channel] = l.listingUrl;
      }
      setUrls(seedUrls);
      setSelected(new Set());
    }
  }, [open, existing]);

  const toggle = (c: ChannelName) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  const canSubmit = selected.size > 0 && !busy;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('admin.styles.goLive.dialogTitle', {
        defaultValue: 'Go live',
      })}
      footer={
        <>
          <Button variant="outline" size="sm" disabled={busy} onClick={onClose}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            size="sm"
            disabled={!canSubmit}
            onClick={() =>
              onConfirm(
                [...selected].map((channel) => {
                  const url = urls[channel]?.trim();
                  return url ? { channel, listingUrl: url } : { channel };
                }),
              )
            }
          >
            <Rocket size={14} />
            <span className="ml-1">
              {t('admin.styles.goLive.confirm', { defaultValue: 'Go live' })}
            </span>
          </Button>
        </>
      }
    >
      <p className="text-sm text-[var(--color-muted-foreground)] mb-4">
        {t('admin.styles.goLive.dialogIntro', {
          defaultValue:
            'Select the channels this style is going live on and paste each public listing URL (optional). Selecting at least one channel is required.',
        })}
      </p>
      <div className="space-y-2">
        {GO_LIVE_CHANNELS.map((c) => {
          const checked = selected.has(c);
          return (
            <div
              key={c}
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] p-3"
            >
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(c)}
                  className="h-4 w-4 accent-[var(--color-primary)]"
                />
                {t(`admin.styles.channel.${c}` as const, { defaultValue: c })}
              </label>
              {checked && (
                <Input
                  type="url"
                  className="mt-2 h-9 text-sm"
                  placeholder={t('admin.styles.goLive.urlPlaceholder', {
                    defaultValue: 'https://… (optional)',
                  })}
                  value={urls[c] ?? ''}
                  onChange={(e) =>
                    setUrls((prev) => ({ ...prev, [c]: e.target.value }))
                  }
                />
              )}
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}
