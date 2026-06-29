insert into field_definitions (key,label_he,label_en,type,required,options,sort_order) values
('manager_name','שם מנהל העבודה','Work manager name','text',true,'[]',10),
('phone','טלפון','Phone','phone',true,'[]',20),
('work_date','תאריך העבודה','Work date','date',true,'[]',30),
('site_location','מיקום האתר','Site location','text',true,'[]',40),
('weather','מזג האוויר','Weather','select',true,
  '[{"he":"שמש","en":"Sunny"},{"he":"מעונן","en":"Cloudy"},{"he":"גשם","en":"Rain"},{"he":"רוח","en":"Wind"},{"he":"אחר","en":"Other"}]',50),
('daily_content','תוכן יומי - קטע לביצוע','Daily content / section to execute','long_text',true,'[]',60),
('contractor','שם הקבלן ומספר העובדים','Contractor name & number of workers','text',true,'[]',70),
('equipment','ציוד בשימוש ולמי שייך','Equipment in use & owner','text',true,'[]',80),
('manager_notes','הערות מנהל עבודה','Work manager notes','long_text',false,'[]',85),
('site_photos','תמונות מהשטח','Site photos','photo',true,'[]',90)
on conflict (key) do nothing;
