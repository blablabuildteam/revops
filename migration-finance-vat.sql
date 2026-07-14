-- One-time migration: convert finance deal amounts from excl. to incl. 21% VAT
-- Safe to re-run only before finance_deals_incl_vat flag is set (app migration handles this automatically)

UPDATE finance_deals SET
  total_deal_value = ROUND(total_deal_value * 1.21, 2),
  monthly_fee = ROUND(monthly_fee * 1.21, 2),
  monthly_revshare = ROUND(monthly_revshare * 1.21, 2),
  amount_paid = ROUND(amount_paid * 1.21, 2),
  updated_at = now()
WHERE NOT EXISTS (
  SELECT 1 FROM finance_settings WHERE key = 'finance_deals_incl_vat' AND value = 'true'
);

UPDATE finance_deals
SET payments = (
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'date', elem->>'date',
      'amount', ROUND((elem->>'amount')::numeric * 1.21, 2)
    )
  ), '[]'::jsonb)
  FROM jsonb_array_elements(payments) AS elem
)
WHERE jsonb_array_length(COALESCE(payments, '[]'::jsonb)) > 0
  AND NOT EXISTS (
    SELECT 1 FROM finance_settings WHERE key = 'finance_deals_incl_vat' AND value = 'true'
  );

INSERT INTO finance_settings (key, value, updated_at)
VALUES ('finance_deals_incl_vat', 'true', now())
ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = now();
