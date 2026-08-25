from pathlib import Path
import csv
import json
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'output'

with (OUT / 'freight-year-365.json').open(encoding='utf-8') as handle:
    result = json.load(handle)

rows = []
with (OUT / 'freight-year-365-daily.csv').open(encoding='utf-8') as handle:
    for row in csv.DictReader(handle, delimiter=';'):
        rows.append({key: int(value) for key, value in row.items()})

monthly = []
for index in range(0, len(rows), 30):
    chunk = rows[index:index + 30]
    monthly.append({
        'label': f'M{len(monthly) + 1}',
        'revenue': sum(row['Erlöse'] for row in chunk),
        'costs': sum(row['Betriebskosten'] + row['Fixkosten'] + row['Wartungskosten'] for row in chunk),
    })

BG = '#07121f'
PANEL = '#0d2135'
GRID = '#28445c'
TEXT = '#d8e7f4'
MUTED = '#8ba4ba'
AMBER = '#f0a62b'
CYAN = '#37b7e8'
ROSE = '#ec6f7f'

fig, axes = plt.subplots(2, 1, figsize=(13.6, 8.3), dpi=150, gridspec_kw={'height_ratios': [1.25, 1]})
fig.patch.set_facecolor(BG)

for ax in axes:
    ax.set_facecolor(PANEL)
    ax.tick_params(colors=MUTED, labelsize=8)
    ax.spines[['top', 'right', 'left', 'bottom']].set_color(GRID)
    ax.grid(axis='y', color=GRID, linewidth=0.7, alpha=0.65)

axes[0].plot([row['Tag'] for row in rows], [row['Kontostand'] for row in rows], color=AMBER, linewidth=2.2)
axes[0].fill_between([row['Tag'] for row in rows], [row['Kontostand'] for row in rows], color=AMBER, alpha=0.12)
axes[0].scatter([1, 365], [rows[0]['Kontostand'], rows[-1]['Kontostand']], color=CYAN, s=28, zorder=3)
axes[0].set_title('EVU-Simulator · 365-Tage-Güterverkehrs-Simulation', color=TEXT, fontsize=14, fontweight='bold', loc='left', pad=12)
axes[0].text(0, 1.02, f"Startkapital {result['startCapital']:,.0f} €  |  Endkapital {result['endCapital']:,.0f} €  |  Stabil: ja", transform=axes[0].transAxes, color=MUTED, fontsize=9)
axes[0].set_xlim(1, 365)
axes[0].set_ylabel('Kontostand in €', color=TEXT, fontsize=9)
axes[0].yaxis.set_major_formatter(FuncFormatter(lambda value, _: f'{value/1_000_000:.1f} Mio.' if value >= 1_000_000 else f'{value/1_000:.0f} Tsd.'))

labels = [row['label'] for row in monthly]
x = list(range(len(labels)))
width = 0.36
axes[1].bar([value - width / 2 for value in x], [row['revenue'] for row in monthly], width=width, color=CYAN, label='Erlöse')
axes[1].bar([value + width / 2 for value in x], [row['costs'] for row in monthly], width=width, color=ROSE, label='Kosten')
axes[1].set_xticks(x, labels)
axes[1].set_ylabel('Betrag in €', color=TEXT, fontsize=9)
axes[1].yaxis.set_major_formatter(FuncFormatter(lambda value, _: f'{value/1_000:.0f} Tsd.'))
axes[1].legend(facecolor=PANEL, edgecolor=GRID, labelcolor=TEXT, fontsize=8, loc='upper left')
axes[1].set_title('Monatsblöcke: Erlöse gegenüber Betrieb, Fixkosten und Wartung', color=TEXT, fontsize=11, loc='left', pad=12)

fig.text(0.01, 0.01, 'Datenbasis: deterministischer Headless-Lauf mit vorhandenen Spielregeln; keine externen Marktdaten.', color=MUTED, fontsize=7.5)
fig.tight_layout(rect=(0, 0.03, 1, 1))
fig.savefig(OUT / 'freight-year-365-summary.png', facecolor=BG, bbox_inches='tight')
