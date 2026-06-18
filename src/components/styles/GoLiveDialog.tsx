import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link2 } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ChannelName, StyleChannelListing } from '@/api/types';
import type { GoLiveChannel } from '@/api/styles';

// Channels a style can be listed on. `nowi_shopify` first since it's the owned
// storefront; the marketplaces follow. Sourced from the BE ChannelName enum —
// add new channels here when they come online.
export const GO_LIVE_CHANNELS: ChannelName[] = [
  'nowi_shopify',
  'myntra',
  'nykaa',
  'amazon',
  'other',
];

// MRP convention: 3x-3.5x of the style's cost price. We prefill at the low end
// (3x) and treat the band as a soft guide — values outside it warn but save.
const MRP_MIN_MULT = 3;
const MRP_MAX_MULT = 3.5;
const suggestMrp = (cost: number) => Math.round(cost * MRP_MIN_MULT);

/**
 * "Add marketplace listings" dialog — the shared channel+link picker used by
 * the Style workspace (so listings can't diverge). Pick one or more channels
 * and paste each public listing URL + its MRP; the channels are recorded as
 * prepared listings. They go LIVE automatically once the EasyEcom checkpoint is
 * marked done — this dialog no longer flips the style live itself. A URL is
 * REQUIRED for every selected channel (a live listing must carry its link); MRP
 * is captured here too (prefilled at 3x cost, a soft 3-3.5x band).
 */
export default function GoLiveDialog({
  open,
  busy,
  existing,
  costPrice,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  existing: StyleChannelListing[];
  /** Style cost price — drives the 3x MRP prefill + the 3-3.5x band warning. */
  costPrice?: number | null;
  onClose: () => void;
  onConfirm: (channels: GoLiveChannel[]) => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Set<ChannelName>>(new Set());
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [mrps, setMrps] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      // Pre-seed URLs + MRPs from existing listings, and pre-select any channel
      // that already has a link, so re-opening edits rather than starts fresh.
      const seedUrls: Record<string, string> = {};
      const seedMrps: Record<string, string> = {};
      const seedSelected = new Set<ChannelName>();
      for (const l of existing) {
        if (l.listingUrl) {
          seedUrls[l.channel] = l.listingUrl;
          seedSelected.add(l.channel);
        }
        if (l.mrp != null) seedMrps[l.channel] = String(l.mrp);
      }
      setUrls(seedUrls);
      setMrps(seedMrps);
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

  // Prefill MRP at 3x cost the first time a channel is selected (no value yet).
  // Done on check so the user sees a sensible default they can override.
  const handleToggle = (c: ChannelName) => {
    toggle(c);
    if (
      costPrice != null &&
      costPrice > 0 &&
      !selected.has(c) &&
      !mrps[c]?.trim()
    ) {
      setMrps((prev) => ({ ...prev, [c]: String(suggestMrp(costPrice)) }));
    }
  };

  // A channel's MRP is "out of band" if it's set and falls outside 3-3.5x cost
  // — a soft warning (we still let it save).
  const mrpOutOfBand = (c: ChannelName): boolean => {
    if (costPrice == null || costPrice <= 0) return false;
    const v = mrps[c]?.trim() ? Number(mrps[c]) : NaN;
    if (!Number.isFinite(v)) return false;
    return v < costPrice * MRP_MIN_MULT || v > costPrice * MRP_MAX_MULT;
  };

  // A listing needs its link — every selected channel must have a non-empty URL.
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
                [...selected].map((channel) => {
                  const raw = mrps[channel]?.trim();
                  const mrp = raw ? Number(raw) : NaN;
                  return {
                    channel,
                    listingUrl: urls[channel]!.trim(),
                    mrp: Number.isFinite(mrp) ? mrp : undefined,
                  };
                }),
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
                  onChange={() => handleToggle(c)}
                  className="h-4 w-4 accent-[var(--color-primary)]"
                />
                {t(`admin.styles.channel.${c}` as const, { defaultValue: c })}
              </label>
              {checked && (
                <>
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
                  {/* Per-channel MRP — prefilled at 3x cost, soft 3-3.5x band. */}
                  <div className="relative mt-2">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-[var(--color-muted-foreground)]">
                      ₹
                    </span>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      className="h-9 pl-6 text-sm"
                      placeholder={t('admin.styles.goLive.mrpPlaceholder', {
                        defaultValue: 'MRP (selling price)',
                      })}
                      value={mrps[c] ?? ''}
                      onChange={(e) =>
                        setMrps((prev) => ({ ...prev, [c]: e.target.value }))
                      }
                    />
                  </div>
                  {costPrice != null && costPrice > 0 && (
                    <p
                      className={
                        mrpOutOfBand(c)
                          ? 'mt-1 text-xs text-[var(--color-warning)]'
                          : 'mt-1 text-xs text-[var(--color-muted-foreground)]'
                      }
                    >
                      {mrpOutOfBand(c)
                        ? t('admin.styles.goLive.mrpOutOfBand', {
                            min: Math.round(costPrice * MRP_MIN_MULT),
                            max: Math.round(costPrice * MRP_MAX_MULT),
                            defaultValue: `Outside the suggested ₹${Math.round(
                              costPrice * MRP_MIN_MULT,
                            )}–₹${Math.round(
                              costPrice * MRP_MAX_MULT,
                            )} (3–3.5× cost) — saved as entered.`,
                          })
                        : t('admin.styles.goLive.mrpSuggested', {
                            min: Math.round(costPrice * MRP_MIN_MULT),
                            max: Math.round(costPrice * MRP_MAX_MULT),
                            defaultValue: `Suggested ₹${Math.round(
                              costPrice * MRP_MIN_MULT,
                            )}–₹${Math.round(
                              costPrice * MRP_MAX_MULT,
                            )} (3–3.5× cost).`,
                          })}
                    </p>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}
