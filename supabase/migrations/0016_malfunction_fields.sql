-- Malfunction (בלת"מ): a department selector (default "none" = no malfunction) and a
-- free-text description. Rendered by the dynamic form / report like any other field.
insert into field_definitions (key,label_he,label_en,type,required,options,sort_order) values
('malfunction_dept','מחלקת בלת"מ','Malfunction dept.','select',true,
  '[{"he":"אין","en":"None"},{"he":"לוגיסטיקה ומחסן","en":"Logistics & warehouse"},{"he":"קבלנים","en":"Contractors"},{"he":"לקוחות","en":"Customers"},{"he":"הנדסה","en":"Engineering"},{"he":"רכש","en":"Purchasing"},{"he":"כספים","en":"Finance"},{"he":"אחר","en":"Other"}]',86),
('malfunction','בלת"מ','Malfunction','long_text',false,'[]',87)
on conflict (key) do nothing;
