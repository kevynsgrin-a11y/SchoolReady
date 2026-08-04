-- Down migration for 0005_recalls_tax_holidays. Drops in reverse dependency
-- order.
DROP INDEX IF EXISTS idx_tax_holiday_categories_holiday;
DROP TABLE tax_holiday_categories;
DROP INDEX IF EXISTS idx_tax_holidays_state;
DROP TABLE tax_holidays;
DROP INDEX IF EXISTS idx_recall_products_upc;
DROP INDEX IF EXISTS idx_recall_products_recall;
DROP TABLE recall_products;
DROP INDEX IF EXISTS idx_recalls_recall_date;
DROP TABLE recalls;
