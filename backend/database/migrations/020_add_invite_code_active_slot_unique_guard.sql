ALTER TABLE invite_codes
  ADD COLUMN active_slot_key VARCHAR(100)
    GENERATED ALWAYS AS (
      CASE
        WHEN status = 'active' THEN slot_key
        ELSE NULL
      END
    ) STORED,
  ADD UNIQUE KEY uk_invite_codes_active_slot_key (active_slot_key);
