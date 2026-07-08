import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link2 } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ChannelName, StyleChannelListing } from '@/api/types';
import type { GoLiveChannel } from '@/api/styles';

// Channels a style can be listed on. `nowi_shopify` first (owned storefront),
// marketplaces follow. Sourced from the BE ChannelName enum.
export const GO_LIVE_CHANNELS: ChannelName[] = [
  'nowi_shopify',
  'myntra',
  'nykaa',
  'amazon',
  'other',
];

/**
 * "Add marketplace listings" dialog — pick channels + paste each public listing
 * URL. Recorded as prepared listings; they go live once EasyEcom is marked done.
 * MRP is no longer per-channel — it's a single per-style value edited elsewhere.
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
      // Pre-seed URLs + pre-select any channel with a link, so re-opening edits.
      const seedUrls: Record<string, string> = {};
      const seedSelected = new Set<ChannelName>();
      for (const l of existing) {
        if (l.listingUrl) {
          seedUrls[l.channel] = l.listingUrl;
          seedSelected.add(l.channel);
        }
      }
      setUrls(seedUrls);
      setSelected(seedSelected);
    }
  }, [open, existing]);

  const toggle = (c: ChannelName) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  // Every selected channel must have a non-empty URL.
  const allSelectedHaveUrl = [...selected].every((c) => urls[c]?.trim());
  const canSubmit = selected.size > 0 && allSelectedHaveUrl && !busy;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('admin.styles.goLive.dialogTitle', {
        defaultValue: 'Add marketplace listings',
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
                [...selected].map((channel) => ({
                  channel,
                  listingUrl: urls[channel]!.trim(),
                })),
              )
            }
          >
            <Link2 size={14} />
            <span className="ml-1">
              {t('admin.styles.goLive.confirm', { defaultValue: 'Save listings' })}
            </span>
          </Button>
        </>
      }
    >
      <p className="text-sm text-[var(--color-muted-foreground)] mb-4">
        {t('admin.styles.goLive.dialogIntro', {
          defaultValue:
            'Select each channel this style is listed on and paste its public listing URL. Listings go live automatically once EasyEcom is marked done.',
        })}
      </p>
      <div className="space-y-2">
        {GO_LIVE_CHANNELS.map((c) => {
          const checked = selected.has(c);
          const missingUrl = checked && !urls[c]?.trim();
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
                    defaultValue: 'https://… (listing link, required)',
                  })}
                  value={urls[c] ?? ''}
                  onChange={(e) =>
                    setUrls((prev) => ({ ...prev, [c]: e.target.value }))
                  }
                  aria-invalid={missingUrl}
                />
              )}
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}
