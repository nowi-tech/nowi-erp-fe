import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ListChecks } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getArticleSummary, type ArticleSummary } from '@/api/articles';

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-2xl font-serif tabular-nums">{value}</div>
      <div className="text-xs text-[var(--color-muted-foreground)]">{label}</div>
    </div>
  );
}

export default function ArticlesSummary() {
  const [data, setData] = useState<ArticleSummary | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    getArticleSummary()
      .then(setData)
      .catch(() => setErr(true));
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-serif text-2xl">Article Dashboard</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Live roll-up of new article development — computed, always current.
          </p>
        </div>
        <Link to="/articles/list">
          <Button size="sm" variant="outline">
            <ListChecks size={15} />
            <span className="ml-1">Open tracker</span>
          </Button>
        </Link>
      </div>

      {err && (
        <p className="text-sm text-[var(--status-stuck-ink)]">
          Could not load the summary. Try refreshing.
        </p>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Card>
              <CardContent className="pt-5">
                <Stat label="Styles developed" value={data.totals.stylesDeveloped} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <Stat label="SKUs developed" value={data.totals.skusDeveloped} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <Stat label="Styles approved" value={data.totals.stylesApproved} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <Stat label="SKUs in production" value={data.totals.skusInProduction} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <Stat label="Live SKUs" value={data.totals.liveSkus} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <Stat label="Planned / Produced" value={data.totals.plannedQty} />
                <div className="text-xs text-[var(--color-muted-foreground)] mt-1">
                  produced {data.totals.producedQty}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">By category</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead className="text-[var(--color-muted-foreground)]">
                    <tr>
                      <th className="text-left font-medium px-2 py-2">Category</th>
                      <th className="text-right font-medium px-2 py-2">Styles</th>
                      <th className="text-right font-medium px-2 py-2">SKUs</th>
                      <th className="text-right font-medium px-2 py-2">Approved</th>
                      <th className="text-right font-medium px-2 py-2">In prod</th>
                      <th className="text-right font-medium px-2 py-2">Live</th>
                      <th className="text-right font-medium px-2 py-2">Planned</th>
                      <th className="text-right font-medium px-2 py-2">Produced</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.categories.map((c) => (
                      <tr
                        key={c.category}
                        className="border-t border-[var(--color-border)]"
                      >
                        <td className="px-2 py-2">{c.label}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{c.stylesDeveloped}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{c.skusDeveloped}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{c.stylesApproved}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{c.skusInProduction}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{c.liveSkus}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{c.plannedQty}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{c.producedQty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
