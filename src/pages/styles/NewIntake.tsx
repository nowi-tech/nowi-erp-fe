import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

import SourceToggle from '@/components/styles/SourceToggle';
import StyleIntakeForm, {
  type StyleIntakeFormHandle,
  type SubmissionForkMode,
} from '@/components/styles/StyleIntakeForm';
import { fineCategoryLabel } from '@/components/styles/intake/categoryOptions';

import { createStyle, listFabrics } from '@/api/styles';
import { listCategories } from '@/api/categories';
import { listCollections } from '@/api/collections';
import type {
  CategoryWithStyleCode,
  Collection,
  Fabric,
  StyleSource,
} from '@/api/types';
import { cn } from '@/lib/utils';

/**
 * Style intake page — thin wrapper around the shared
 * `<StyleIntakeForm>`. Owns the page chrome (breadcrumb, h1, source
 * toggle, reviewer card, sticky footer); the form itself is the
 * exact same component the edit modal renders, so the two flows
 * never drift apart.
 */
export default function NewIntake() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();

  const initialSource: StyleSource =
    (params.get('source') as StyleSource | null) === 'china_import'
      ? 'china_import'
      : 'sampling';

  const [source, setSource] = useState<StyleSource>(initialSource);
  const [fabrics, setFabrics] = useState<Fabric[]>([]);
  const [categories, setCategories] = useState<CategoryWithStyleCode[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [busy, setBusy] = useState<null | 'draft' | 'submit'>(null);
  const [err, setErr] = useState<string | null>(null);
  const [valid, setValid] = useState(false);
  const [categoryCodeForChip, setCategoryCodeForChip] = useState<string | null>(
    null,
  );
  // Which submission path the form is on (new / colour / based-on). All
  // three land at the same Approval #1 — the sticky footer's submit verb
  // adapts so the action reads true to the choice.
  const [forkMode, setForkMode] = useState<SubmissionForkMode>('new');

  const formRef = useRef<StyleIntakeFormHandle>(null);

  // Load master data once.
  useEffect(() => {
    void Promise.all([
      listFabrics().catch(() => [] as Fabric[]),
      listCategories().catch(() => [] as CategoryWithStyleCode[]),
      listCollections().catch(() => [] as Collection[]),
    ]).then(([fb, cats, cols]) => {
      setFabrics(fb);
      setCategories(cats);
      setCollections(cols);
    });
  }, []);

  const save = async (mode: 'draft' | 'submit') => {
    if (!valid) {
      setErr(t('admin.styles.intake.needsName'));
      return;
    }
    setBusy(mode);
    setErr(null);
    try {
      const created = await formRef.current?.submit();
      if (!created) return;
      toast.show(
        mode === 'draft'
          ? t('admin.styles.intake.createdToast')
          : t('admin.styles.intake.submittedToast'),
        'success',
      );
      navigate(`/styles/${created.styleId ?? created.id}`);
    } catch (e: unknown) {
      const m =
        (e as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message ?? t('admin.styles.intake.saveError');
      setErr(Array.isArray(m) ? m.join(', ') : String(m));
    } finally {
      setBusy(null);
    }
  };

  const submitDisabled = !valid;
  // Submit verb reacts to the fork. The colour / based-on paths spell out
  // what they do; new-design / china just submit for approval.
  const submitLabel =
    source === 'china_import' || forkMode === 'new'
      ? t('admin.styles.intake.submitForApproval')
      : forkMode === 'colour'
        ? t('admin.styles.intake.fork.submitColour')
        : t('admin.styles.intake.fork.submitBasedOn');
  // The fork paths have more than one possible blocker (a resolved source
  // style AND a working name — plus a colour for the colour fork), so the
  // hint stays inclusive rather than pin-pointing only the target, which
  // misled users who'd already picked the style.
  const footerHint = submitDisabled
    ? forkMode !== 'new' && source !== 'china_import'
      ? t('admin.styles.intake.fork.needsTargetAndFields', {
          defaultValue:
            'Pick the source style and complete the required fields to submit.',
        })
      : t('admin.styles.intake.needsName')
    : t('admin.styles.intake.readyHint');

  return (
    <div className="mx-auto w-full max-w-[1280px] px-3 pb-32 sm:px-4">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1 pt-4 text-[12px] text-[var(--color-muted-foreground)]"
      >
        <Link
          to="/styles"
          className="hover:text-[var(--color-foreground)] hover:underline"
        >
          {t('admin.styles.intake.breadcrumbStyles')}
        </Link>
        <ChevronRight size={12} />
        <span className="text-[var(--color-foreground)]">
          {t('admin.styles.intake.breadcrumbNewIntake')}
        </span>
      </nav>

      <header className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-serif text-[26px] leading-tight text-[var(--color-primary)] sm:text-[28px]">
          {t('admin.styles.intake.h1')}
        </h1>
        <SourceToggle value={source} onChange={setSource} />
      </header>


      {err && (
        <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--status-stuck-ink)]/30 bg-[var(--status-stuck-bg)] px-3 py-2 text-[13px] text-[var(--status-stuck-ink)]">
          {err}
        </div>
      )}

      <div className="mt-4">
        <StyleIntakeForm
          ref={formRef}
          source={source}
          fabrics={fabrics}
          categories={categories}
          collections={collections}
          onFabricsChanged={setFabrics}
          onCategoriesChanged={setCategories}
          onCollectionsChanged={setCollections}
          onValidityChange={(next) => {
            setValid(next);
            // Mirror the just-categorized code for the footer chip.
            // Re-read on every validity tick — cheap, and the form
            // doesn't expose a more granular change event.
            setCategoryCodeForChip(formRef.current?.getCategoryCode() ?? null);
          }}
          onSaved={() => {
            /* navigate-on-success happens in `save()` */
          }}
          apiCall={(payload) =>
            createStyle(payload as Parameters<typeof createStyle>[0])
          }
          onForkModeChange={setForkMode}
        />
      </div>

      {/* Sticky footer */}
      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-20 border-t border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur',
        )}
      >
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-3 px-3 py-3 sm:px-4">
          <span
            className={cn(
              'text-[12px] sm:text-[13px]',
              submitDisabled
                ? 'text-[var(--color-muted-foreground)]'
                : 'text-[var(--color-foreground)]',
            )}
          >
            {!submitDisabled && categoryCodeForChip && (
              <span className="mr-2 inline-flex items-center rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-foreground)]">
                {fineCategoryLabel(String(categoryCodeForChip))}
              </span>
            )}
            {footerHint}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null || submitDisabled}
              onClick={() => void save('draft')}
            >
              {busy === 'draft'
                ? t('common.saving')
                : t('admin.styles.intake.saveDraft')}
            </Button>
            <Button
              size="sm"
              disabled={busy !== null || submitDisabled}
              onClick={() => void save('submit')}
            >
              {busy === 'submit' ? t('common.saving') : submitLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
