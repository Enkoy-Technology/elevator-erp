-- Lean scope: drop Phase 3 field-installation tables (not needed for Shining Star MVP).

DROP TABLE IF EXISTS project_phases;--> statement-breakpoint
DROP TABLE IF EXISTS crew_members;--> statement-breakpoint
DROP TABLE IF EXISTS crews;--> statement-breakpoint
DROP TYPE IF EXISTS install_phase_status;--> statement-breakpoint
DROP TYPE IF EXISTS install_phase_kind;--> statement-breakpoint
DROP TYPE IF EXISTS crew_type;
