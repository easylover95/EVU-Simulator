from pathlib import Path
import csv
import json
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'output'

COLORS = {
    'bg': '#07121f', 'panel': '#0d2135', 'grid': '#28445c', 'text': '#d8e7f4', 'muted': '#8ba4ba',
    'amber': '#f0a62b', 'cyan': '#37b7e8', 'blue': '#296fca', 'rose': '#ec6f7f', 'purple': '#a879e6',
    'green': '#4fc58d', 'slate': '#66859f', 'orange': '#f17d3f',
}


def load_json(name):
    with (OUT / name).open(encoding='utf-8') as handle:
        return json.load(handle)


def load_csv(name):
    rows = []
    with (OUT / name).open(encoding='utf-8') as handle:
        for row in csv.DictReader(handle, delimiter=';'):
            rows.append({key: int(value) for key, value in row.items()})
    return rows


def euro_axis(value, _):
    if abs(value) >= 1_000_000:
        return f'{value / 1_000_000:.1f} Mio.'
    return f'{value / 1_000:.0f} Tsd.'


def style_axis(ax):
    ax.set_facecolor(COLORS['panel'])
    ax.grid(axis='y', color=COLORS['grid'], linewidth=0.7, alpha=0.7)
    ax.tick_params(colors=COLORS['muted'], labelsize=8)
    for spine in ax.spines.values():
        spine.set_color(COLORS['grid'])


baseline = load_json('freight-year-365.json')
dynamic = load_json('dynamic-freight-year-365.json')
base_days = load_csv('freight-year-365-daily.csv')
dyn_days = load_csv('dynamic-freight-year-365-daily.csv')

fig = plt.figure(figsize=(15.4, 12), dpi=160, facecolor=COLORS['bg'])
grid = fig.add_gridspec(3, 1, height_ratios=[1.25, 0.85, 1.15], hspace=0.4)

# 1. Capital development
ax1 = fig.add_subplot(grid[0])
style_axis(ax1)
ax1.plot([row['Tag'] for row in base_days], [row['Kontostand'] for row in base_days], color=COLORS['slate'], linewidth=1.8, label='Basisszenario')
ax1.plot([row['Tag'] for row in dyn_days], [row['Kontostand'] for row in dyn_days], color=COLORS['amber'], linewidth=2.5, label='Dynamische Flotte')
for event in dynamic['investments']:
    ax1.axvline(event['day'], color=COLORS['cyan'], linestyle='--', linewidth=1.1, alpha=0.9)
    ax1.scatter([event['day']], [event['balanceAfter']], color=COLORS['cyan'], edgecolor=COLORS['bg'], s=45, zorder=5)
    label = 'BR 232 + Kredit' if event['kind'] == 'credit-and-br232' else 'BR 140/143'
    ax1.annotate(label, xy=(event['day'], event['balanceAfter']), xytext=(7, 12), textcoords='offset points', color=COLORS['text'], fontsize=8, fontweight='bold')
for event in dynamic.get('risks', {}).get('events', []):
    balance = next(row['Kontostand'] for row in dyn_days if row['Tag'] == event['day'])
    ax1.axvspan(event['day'], event['day'] + event['downtimeDays'] - 1, color=COLORS['rose'], alpha=0.11)
    ax1.scatter([event['day']], [balance], marker='x', color=COLORS['rose'], s=48, linewidths=1.8, zorder=6)
    ax1.annotate(f"Schaden · {event['repairCost'] / 1_000:.1f} Tsd.", xy=(event['day'], balance), xytext=(5, -16), textcoords='offset points', color=COLORS['rose'], fontsize=7.3)
ax1.set_title('Tägliche Kapitalentwicklung im verschärften Modus: Basis gegenüber dynamischer Flotte', color=COLORS['text'], fontsize=14, fontweight='bold', loc='left', pad=14)
ax1.text(0, 1.02, f"Endkapital Basis {baseline['endCapital']:,.0f} €  |  Dynamisch {dynamic['endCapital']:,.0f} €  |  Differenz {dynamic['endCapital'] - baseline['endCapital']:,.0f} €", transform=ax1.transAxes, color=COLORS['muted'], fontsize=9)
ax1.set_xlim(1, 365)
ax1.set_ylabel('Kontostand in €', color=COLORS['text'], fontsize=9)
ax1.yaxis.set_major_formatter(FuncFormatter(euro_axis))
legend = ax1.legend(facecolor=COLORS['panel'], edgecolor=COLORS['grid'], labelcolor=COLORS['text'], fontsize=8, loc='upper left')
for text in legend.get_texts():
    text.set_color(COLORS['text'])

# 2. Fleet development
ax2 = fig.add_subplot(grid[1])
style_axis(ax2)
days = [row['Tag'] for row in dyn_days]
ax2.step(days, [row['Lokanzahl'] for row in dyn_days], where='post', color=COLORS['cyan'], linewidth=2.7, label='Lokomotiven')
ax2.step(days, [row['AktiveFahrten'] for row in dyn_days], where='post', color=COLORS['green'], linewidth=2.2, label='Tägliche Güterläufe')
ax2.set_ylim(0, 5)
ax2.set_yticks(range(0, 5))
ax2.set_xlim(1, 365)
ax2.set_ylabel('Anzahl', color=COLORS['text'], fontsize=9)
ax2.set_title('Operative Skalierung: Fuhrpark und tägliche Zugläufe', color=COLORS['text'], fontsize=11, loc='left', pad=10)
for event in dynamic['investments']:
    ax2.axvline(event['day'], color=COLORS['cyan'], linestyle='--', linewidth=1, alpha=0.75)
legend = ax2.legend(facecolor=COLORS['panel'], edgecolor=COLORS['grid'], labelcolor=COLORS['text'], fontsize=8, loc='upper left')
for text in legend.get_texts():
    text.set_color(COLORS['text'])

# 3. Cost allocation including investments and loan servicing
ax3 = fig.add_subplot(grid[2])
style_axis(ax3)
costs = dynamic['costs']
segments = [
    ('Trasse / Energie', costs['pathEnergy'], COLORS['blue']),
    ('Standort / Depot', costs['depot'], COLORS['slate']),
    ('Personal', costs['payroll'] + costs['hiring'] + costs['quickPay'], COLORS['green']),
    ('Wartung / Schaden', costs['maintenance'] + costs['wagonRevision'] + costs.get('unplannedRepairs', 0), COLORS['orange']),
    ('Versicherung', costs['insurance'], COLORS['purple']),
    ('Kreditdienst', costs['loanInterest'] + costs['loanPrincipal'], COLORS['rose']),
    ('Lok-Investitionen', costs['locomotiveInvestment'], COLORS['amber']),
    ('Wagen-Investitionen', costs['wagonInvestment'], '#c99b5a'),
]
left = 0
for label, value, color in segments:
    ax3.barh(['Dynamische Flotte'], [value], left=left, color=color, height=0.48, label=label)
    if value > 130_000:
        ax3.text(left + value / 2, 0, f'{value / 1_000:.0f} Tsd.', color=COLORS['bg'], ha='center', va='center', fontsize=8, fontweight='bold')
    left += value
ax3.set_title('Kostenverteilung im verschärften Modus inklusive Schaden, Anschaffungen und Kreditdienst', color=COLORS['text'], fontsize=11, loc='left', pad=10)
ax3.set_xlabel('Cash-Abfluss in €', color=COLORS['text'], fontsize=9)
ax3.xaxis.set_major_formatter(FuncFormatter(euro_axis))
ax3.legend(ncol=4, bbox_to_anchor=(0, -0.23), loc='upper left', facecolor=COLORS['panel'], edgecolor=COLORS['grid'], labelcolor=COLORS['text'], fontsize=7.5)

fig.text(0.01, 0.012, 'Datenbasis: deterministischer 365-Tage-Headless-Lauf mit lokalen Spielregeln. Kosten +8 %, variable Standortkapazität, 180-Tage-Kredit und reproduzierbare Lokschäden; keine externen Marktdaten.', color=COLORS['muted'], fontsize=7.2)
fig.tight_layout(rect=(0, 0.04, 1, 1))
fig.savefig(OUT / 'dynamic-freight-year-365-analysis.png', facecolor=COLORS['bg'], bbox_inches='tight')
