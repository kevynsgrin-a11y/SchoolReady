-- Down migration for 0004_lists_requirements. Drops in reverse dependency
-- order.
DROP INDEX IF EXISTS idx_inventory_items_product_type;
DROP INDEX IF EXISTS idx_inventory_items_household;
DROP TABLE inventory_items;
DROP INDEX IF EXISTS idx_requirements_product_type;
DROP INDEX IF EXISTS idx_requirements_list;
DROP TABLE requirements;
DROP INDEX IF EXISTS idx_list_assignments_member;
DROP INDEX IF EXISTS idx_list_assignments_list;
DROP TABLE list_assignments;
DROP INDEX IF EXISTS idx_supply_lists_school;
DROP INDEX IF EXISTS idx_supply_lists_household;
DROP TABLE supply_lists;
