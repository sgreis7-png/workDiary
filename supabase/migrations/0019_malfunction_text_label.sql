-- Rename the malfunction free-text (description) field label (display only).
update field_definitions
  set label_he = 'בלת"מ - הסבר',
      label_en = 'Malfunction — description'
  where key = 'malfunction';
