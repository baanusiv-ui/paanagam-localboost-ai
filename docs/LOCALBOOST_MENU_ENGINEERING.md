# LocalBoost menu engineering intelligence

## Delivery
The authenticated business-scoped `GET /v1/businesses/:businessId/menu-sales-intelligence` response now includes `menuEngineering`. The dashboard adds a Menu engineering tab under Growth intelligence and reads this endpoint only.

## Classification
- Popularity threshold: 70% of average recorded units sold per listed item.
- Profitability threshold: average contribution per unit across fully costed items.
- Star: popular and at/above the contribution threshold.
- Plowhorse: popular and below the contribution threshold.
- Puzzle: below the popularity threshold and at/above the contribution threshold.
- Dog: below both thresholds.
- Cost missing: the recorded unit cost does not cover all units, or there is no usable cost baseline.
- No sales: zero recorded units.

## Data safeguards
- Demo records are excluded.
- Date filters apply to both item and daily-sales records.
- POS integration remains read-only. The feature never changes POS orders, menu prices, recipes, stock, or payments.
- Contribution is selling price minus supplied unit cost. It does not silently infer tax, discounts, overhead or wastage.
- Missing dates and missing menu items are not treated as zero sales.
- This is a descriptive heuristic, not a forecast or causal recommendation.
- Owners must verify the data and decide whether to change a menu item.

## Next LocalBoost phases
1. Demand and prep recommendations only after reliable dated item-level sales coverage is available.
2. Customer cohort analysis using privacy-safe aggregate POS data.
3. Review-to-menu issue correlation with human verification and approved recipe facts.
4. Campaign attribution using measured results rather than inferred lift.
