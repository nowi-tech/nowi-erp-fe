import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import ColourPicker from "@/components/styles/intake/ColourPicker";
import ReferenceImageGrid from "@/components/styles/intake/ReferenceImageGrid";
import { spawnColourVariant } from "@/api/styles";
import { listReviewers } from "@/api/users";
import type { Reviewer, Style } from "@/api/types";
import { cn } from "@/lib/utils";

interface Props {
  /** Parent style — the family the new colour belongs to. */
  parent: Style;
  /**
   * The whole colour family resolved off the BE — every sibling sharing
   * the family's `familyCode`, including the parent itself. Drives the
   * duplicate guard + "existing colours" strip so opening Add-Colour from
   * a SIBLING (not the root) still sees the complete family. Falls back to
   * `parent.colourVariants` when not supplied.
   *
   * parentStyleId drives inbox NESTING; familyCode drives the marketplace
   * "other colours" GROUP — do NOT unify; based-on shares neither.
   */
  family?: Style[];
  open: boolean;
  onClose: () => void;
  /** Receives the newly-created child Style on success. */
  onCreated?: (created: Style) => void;
}

/**
 * Spawn a colour-variant Style from an existing parent — a SUBMISSION, not
 * an inline approval. `spawnColourVariant` creates a DRAFT that lands in
 * the Inbox for Approval #1, the SAME flow as a brand-new design; there
 * are deliberately NO inline approval checks in this modal (the spawned
 * sibling skips re-sampling server-side, but a reviewer still approves it).
 * It inherits fabric / gender / category / CAD from the parent; the
 * designer only supplies the new colour + (optionally) fresh refs.
 *
 * Mirrors the Stitch design `79e6039778a14087b6f7a2bb1c31c6fc` — a rich
 * header card surfacing every inherited attribute (no hidden state),
 * then a tight body with just the colour input + optional refs.
 */
export default function AddColourModal({
  parent,
  family,
  open,
  onClose,
  onCreated,
}: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const [colour, setColour] = useState("");
  const [referenceLink, setReferenceLink] = useState("");
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const submitRef = useRef<HTMLButtonElement>(null);

  // The fixed reviewer panel this submission routes to — shown so the
  // designer sees who reviews it (it's a submission, not an inline
  // approval). Fetched when the modal opens; failure is non-fatal.
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listReviewers()
      .then((r) => !cancelled && setReviewers(r))
      .catch(() => !cancelled && setReviewers([]));
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Existing colours in the whole family — drives the "already done" chip
  // strip in the header AND the duplicate guard so designers don't double
  // up. Prefer the BE-resolved `family` (correct even when opened from a
  // sibling); fall back to parent.colourVariants + the parent's own colour
  // when the group wasn't passed in.
  const siblings = useMemo(() => {
    if (family && family.length > 0) {
      return family.map((s) => ({
        id: s.id,
        styleId: s.styleId,
        primaryColour: s.primaryColour,
      }));
    }
    const list = parent.colourVariants ?? [];
    // Include the parent's own colour as the first chip — it's also a
    // member of the family.
    if (parent.primaryColour) {
      return [
        {
          id: parent.id,
          styleId: parent.styleId,
          primaryColour: parent.primaryColour,
        },
        ...list,
      ];
    }
    return list;
  }, [family, parent]);

  const reset = () => {
    setColour("");
    setReferenceLink("");
    setReferenceImages([]);
  };

  const submit = async () => {
    const v = colour.trim();
    if (!v) {
      toast.show(t("admin.styles.addColour.colourRequired"), "error");
      return;
    }
    // Soft duplicate guard — server will accept it but the designer
    // probably typo'd. Match case-insensitively against existing
    // colours in the family.
    const dup = siblings.find(
      (s) => (s.primaryColour ?? "").toLowerCase() === v.toLowerCase(),
    );
    if (dup) {
      toast.show(
        t("admin.styles.addColour.duplicateWarning", {
          colour: v,
          styleId: dup.styleId ?? "—",
        }),
        "error",
      );
      return;
    }
    setSaving(true);
    try {
      const created = await spawnColourVariant(parent.id, {
        primaryColour: v,
        referenceLink: referenceLink.trim() || null,
        referenceImages:
          referenceImages.length > 0 ? referenceImages : undefined,
      });
      toast.show(
        t("admin.styles.addColour.createdToast", { colour: v }),
        "success",
      );
      onCreated?.(created);
      reset();
      onClose();
    } catch (e: unknown) {
      const m =
        (e as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message ?? t("admin.styles.addColour.saveError");
      toast.show(Array.isArray(m) ? m.join(", ") : String(m), "error");
    } finally {
      setSaving(false);
    }
  };

  // ── Header content (matches Stitch design: zero hidden state) ────
  const header = (
    <div className="rounded-[var(--radius-md)] border-l-4 border-l-[var(--color-primary)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-muted-foreground)] mb-1.5">
        {t("admin.styles.addColour.inheritingFrom")}
      </div>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="font-mono text-[15px] font-semibold text-[var(--color-foreground)]">
          {parent.styleId ?? `#${parent.id}`}
        </span>
        <span className="text-[var(--color-muted-foreground)]">·</span>
        <span className="text-[14px] text-[var(--color-foreground)]">
          {parent.workingName ?? "—"}
        </span>
      </div>

      {/* Dense attribute strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1.5 text-[12px]">
        <AttrPair
          label={t("admin.styles.addColour.attrs.gender")}
          value={parent.gender ?? "—"}
        />
        <AttrPair
          label={t("admin.styles.addColour.attrs.category")}
          value={parent.category?.name ?? parent.categoryCode ?? "—"}
        />
        <AttrPair
          label={t("admin.styles.addColour.attrs.fabric")}
          value={parent.fabric?.name ?? "—"}
        />
        <AttrPair
          label={t("admin.styles.addColour.attrs.cad")}
          value={
            parent.patternCadPaths && parent.patternCadPaths.length > 0
              ? t("admin.styles.addColour.attrs.cadCount", {
                  count: parent.patternCadPaths.length,
                })
              : "—"
          }
        />
        <AttrPair
          label={t("admin.styles.addColour.attrs.refs")}
          value={
            (parent.referenceImages?.length ?? 0) > 0
              ? t("admin.styles.addColour.attrs.refsCount", {
                  count: parent.referenceImages!.length,
                })
              : "—"
          }
        />
      </div>

      {/* Existing colours in the family */}
      {siblings.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
          <div className="text-[11px] text-[var(--color-muted-foreground)] mb-1.5">
            {t("admin.styles.addColour.existingColours", {
              count: siblings.length,
            })}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {siblings.map((s) => (
              <span
                key={s.id}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px]",
                  "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-foreground-2)]",
                )}
                title={s.styleId ?? undefined}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full bg-[var(--color-muted-foreground)]"
                  aria-hidden
                />
                {s.primaryColour ?? "—"}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!saving) {
          reset();
          onClose();
        }
      }}
      title={t("admin.styles.addColour.title")}
      footer={
        <div className="flex items-center justify-between gap-3 w-full">
          <span className="min-w-0 truncate text-[11px] leading-snug text-[var(--color-muted-foreground)]">
            {t("admin.styles.addColour.mintHint")}
          </span>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => {
                reset();
                onClose();
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button
              ref={submitRef}
              size="sm"
              disabled={saving || !colour.trim()}
              onClick={() => void submit()}
            >
              {saving
                ? t("admin.styles.addColour.creating")
                : t("admin.styles.addColour.create")}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Colour-variant flow banner (Stitch parity) — reuses the parent's
            approved sample, skips re-sampling, but still needs Approval #1. */}
        <div className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-primary)]/[0.05] p-3 text-[12px] text-[var(--color-foreground)]">
          <Info
            size={15}
            className="mt-0.5 shrink-0 text-[var(--color-primary)]"
          />
          <span>
            {t("admin.styles.addColour.reuseBanner", {
              defaultValue:
                "A colour variant reuses this design's approved sample — no re-sampling. It still needs Approval #1.",
            })}
          </span>
        </div>

        {header}

        <div>
          <h3 className="font-serif text-[16px] text-[var(--color-foreground)]">
            {t("admin.styles.addColour.newColourHeading")}
          </h3>
          <p className="mt-0.5 text-[12px] text-[var(--color-muted-foreground)]">
            {t("admin.styles.addColour.newColourHelp")}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <Label required>{t("admin.styles.addColour.colourLabel")}</Label>
            <ColourPicker
              value={colour}
              onChange={setColour}
              placeholder={t("admin.styles.addColour.colourPh")}
              inlineAdd
              fabricColours={parent.fabric?.colours ?? []}
            />
          </div>

          <div>
            <Label>{t("admin.styles.addColour.refImagesLabel")}</Label>
            <ReferenceImageGrid
              value={referenceImages}
              onChange={setReferenceImages}
              entityId="new"
              referenceLink={referenceLink || null}
            />
          </div>

          <div>
            <Label>{t("admin.styles.addColour.refLinkLabel")}</Label>
            <Input
              value={referenceLink}
              onChange={(e) => setReferenceLink(e.target.value)}
              placeholder="https://…"
            />
          </div>
        </div>

        {/* Who reviews this — the submission routes to the fixed panel. */}
        {reviewers.length > 0 && (
          <div className="flex items-center gap-2.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
            <div className="flex -space-x-1.5">
              {reviewers.slice(0, 3).map((r) => (
                <span
                  key={r.id}
                  title={r.name}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-surface)] text-[10px] font-bold text-[var(--color-foreground)] ring-1 ring-[var(--color-border)]"
                >
                  {reviewerInitials(r.name)}
                </span>
              ))}
            </div>
            <p className="min-w-0 text-[12px] text-[var(--color-muted-foreground)]">
              {t("admin.styles.addColour.routesTo", {
                defaultValue: "Routes to",
              })}{" "}
              <span className="text-[var(--color-foreground)]">
                {reviewers.map((r) => r.name).join(", ")}
              </span>{" "}
              {t("admin.styles.addColour.routesToHint", {
                defaultValue: "— auto-assigned to the review panel.",
              })}
            </p>
          </div>
        )}
      </div>
    </Dialog>
  );
}

function reviewerInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const raw =
    parts.length === 1
      ? parts[0].slice(0, 2)
      : (parts[0][0] ?? "") + (parts[parts.length - 1][0] ?? "");
  return raw.toUpperCase();
}

function AttrPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5 min-w-0">
      <span className="text-[10px] uppercase tracking-[0.06em] text-[var(--color-muted-foreground)] shrink-0">
        {label}:
      </span>
      <span className="text-[12px] text-[var(--color-foreground)] truncate">
        {value}
      </span>
    </div>
  );
}
