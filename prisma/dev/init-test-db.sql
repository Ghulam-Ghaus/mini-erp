-- Runs once, when the dev Postgres volume is first created.
-- Integration tests use this database so they never touch dev data.
CREATE DATABASE mini_erp_test;

