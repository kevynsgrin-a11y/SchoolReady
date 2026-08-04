-- Down migration for 0002_catalog. Drops in reverse dependency order.
DROP INDEX IF EXISTS idx_er_edges_variant_b;
DROP INDEX IF EXISTS idx_er_edges_variant_a;
DROP TABLE entity_resolution_edges;
DROP INDEX IF EXISTS uq_identifier_retailer;
DROP INDEX IF EXISTS uq_identifier_global;
DROP INDEX IF EXISTS idx_product_identifiers_variant;
DROP TABLE product_identifiers;
DROP TABLE retailers;
DROP INDEX IF EXISTS idx_product_variants_canonical;
DROP INDEX IF EXISTS idx_product_variants_product;
DROP TABLE product_variants;
DROP TABLE products;
DROP TABLE product_types;
DROP TABLE brands;
