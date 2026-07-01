-- Rename the malfunction department field label (display only; matching uses the
-- dropdown option values, not this label).
update field_definitions
  set label_he = 'בלת"מ - גורם אחראי',
      label_en = 'Malfunction — responsible party'
  where key = 'malfunction_dept';
