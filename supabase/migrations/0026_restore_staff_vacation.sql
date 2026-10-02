ALTER TABLE mentis_staff_availability
  DROP CONSTRAINT IF EXISTS staff_availability_no_vacation;

CREATE OR REPLACE FUNCTION availability_kind_label(kind text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE kind
    WHEN 'available' THEN 'Available for coaching'
    WHEN 'working_hours' THEN 'Regular working hours'
    WHEN 'on_duty' THEN 'Club duty'
    WHEN 'club_duty' THEN 'Club duty'
    WHEN 'vacation' THEN 'Vacation'
    WHEN 'sick_leave' THEN 'Sick leave'
    WHEN 'duty_outside_club' THEN 'Duty outside club'
    WHEN 'working_elsewhere' THEN 'Working elsewhere'
    WHEN 'personal_appointment' THEN 'Personal appointment'
    WHEN 'training' THEN 'Training / development'
    WHEN 'out_of_office' THEN 'Out of office'
    WHEN 'unavailable_other' THEN 'Unavailable'
    ELSE 'Other'
  END
$$;