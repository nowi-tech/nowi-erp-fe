import type { ProductionDispatch } from '@/api/productionDispatch';

const esc = (s: string | number | null | undefined): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const fmt = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/**
 * Prints a challan in an isolated popup window — no global print CSS and no PDF
 * dependency, so it can't leak styles into the app or fail to load a library.
 * The window closes itself after the print dialog is dismissed.
 */
export function printChallan(d: ProductionDispatch): void {
  const rows = d.items
    .map(
      (it, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td>${esc(it.name)}${it.batchNo ? ` <span class="dim">${esc(it.batchNo)}</span>` : ''}${
          it.brandName ? `<br/><span class="dim">${esc(it.brandName)}</span>` : ''
        }</td>
        <td class="mono">${esc(it.sku)}</td>
        <td class="c">${esc(it.sizeLabel)}</td>
        <td class="r">${esc(it.qtySent)}</td>
      </tr>`,
    )
    .join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"/>
    <title>${esc(d.challanNo)}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: system-ui, -apple-system, Arial, sans-serif; color: #111; margin: 32px; }
      h1 { font-size: 18px; letter-spacing: 2px; margin: 0 0 2px; }
      .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 12px; }
      .meta { text-align: right; font-size: 12px; line-height: 1.5; }
      .parties { display: flex; gap: 40px; margin: 18px 0; font-size: 12px; }
      .parties .lbl { text-transform: uppercase; letter-spacing: 1px; color: #666; font-size: 10px; margin-bottom: 2px; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
      th { text-align: left; border-bottom: 1px solid #111; padding: 6px 8px; text-transform: uppercase; font-size: 10px; letter-spacing: 1px; }
      td { padding: 6px 8px; border-bottom: 1px solid #ddd; vertical-align: top; }
      td.c, th.c { text-align: center; }
      td.r, th.r { text-align: right; }
      .mono { font-family: ui-monospace, Menlo, monospace; font-size: 11px; }
      .dim { color: #888; font-size: 10px; }
      tfoot td { border-top: 2px solid #111; border-bottom: none; font-weight: 700; }
      .notes { margin-top: 16px; font-size: 11px; color: #444; }
      .sign { display: flex; justify-content: space-between; margin-top: 56px; font-size: 11px; }
      .sign div { border-top: 1px solid #111; padding-top: 4px; width: 200px; text-align: center; color: #666; }
    </style></head><body>
    <div class="head">
      <div><h1>DELIVERY CHALLAN</h1><div class="dim">Nowi Fashion</div></div>
      <div class="meta">
        <div><strong>${esc(d.challanNo)}</strong></div>
        <div>${fmt(d.dispatchedAt)}</div>
        <div>${esc(d.status.toUpperCase())}</div>
      </div>
    </div>
    <div class="parties">
      <div><div class="lbl">From</div>Nowi production floor</div>
      <div><div class="lbl">To</div>${esc(d.destWarehouseName)}${
        d.destWarehouseAddress ? `<br/><span class="dim">${esc(d.destWarehouseAddress)}</span>` : ''
      }${
        d.destWarehouseSpocName || d.destWarehouseSpocPhone
          ? `<br/><span class="dim">SPOC: ${esc(
              [d.destWarehouseSpocName, d.destWarehouseSpocPhone].filter(Boolean).join(' · '),
            )}</span>`
          : ''
      }</div>
      <div><div class="lbl">Dispatched by</div>${esc(d.dispatchedBy?.name ?? '—')}</div>
    </div>
    <table>
      <thead><tr><th class="c">#</th><th>Item</th><th>SKU</th><th class="c">Size</th><th class="r">Qty</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="4" class="r">Total</td><td class="r">${esc(d.qtySent)}</td></tr></tfoot>
    </table>
    ${d.notes ? `<div class="notes">Notes: ${esc(d.notes)}</div>` : ''}
    <div class="sign"><div>Dispatched by</div><div>Received by</div></div>
  </body></html>`;

  const w = window.open('', '_blank', 'width=800,height=900');
  if (!w) return; // popup blocked — nothing to do
  w.document.write(html);
  w.document.close();
  w.focus();

  // The load event on a document.write()-n page is unreliable across browsers,
  // so fire whichever of {onload, timeout} lands first and guard against the
  // other running on an already-closed window.
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    try {
      w.print();
      w.close();
    } catch {
      /* window already gone */
    }
  };
  w.onload = run;
  setTimeout(run, 400);
}
