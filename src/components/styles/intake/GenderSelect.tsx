import { Select } from '@/components/ui/select';
import type { Gender } from '@/api/types';

interface Props {
  value: Gender;
  onChange: (next: Gender) => void;
  /** Override the visible labels (i18n). Order: women, men, unisex. */
  labels?: { women: string; men: string; unisex: string };
  disabled?: boolean;
}

const OPTIONS: Gender[] = ['women', 'men', 'unisex'];

/**
 * Gender picker as a native dropdown. Replaces the older three-button
 * segmented control on the intake + scoped-edit forms: gender is a
 * plain attribute (switching it never disturbs the chosen category —
 * the same Category row maps to a gender-appropriate `articleCategory`
 * at save via `deriveArticleCategory`), so a compact `<select>` reads
 * cleaner than three toggles. Drop-in for the old `GenderSegment`
 * (same `value` / `onChange` / `labels` contract).
 */
export default function GenderSelect({
  value,
  onChange,
  labels,
  disabled = false,
}: Props) {
  const text = (g: Gender) =>
    labels?.[g] ?? (g === 'women' ? 'Women' : g === 'men' ? 'Men' : 'Unisex');
  return (
    <Select
      value={value}
      disabled={disabled}
      aria-label="Gender"
      onChange={(e) => onChange(e.target.value as Gender)}
    >
      {OPTIONS.map((g) => (
        <option key={g} value={g}>
          {text(g)}
        </option>
      ))}
    </Select>
  );
}
