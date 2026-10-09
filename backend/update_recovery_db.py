from database import get_connection

connection = get_connection()
cursor = connection.cursor()

columns = [
    "ALTER TABLE recovery_plans ADD COLUMN IF NOT EXISTS shipment_code VARCHAR(100)",
    "ALTER TABLE recovery_plans ADD COLUMN IF NOT EXISTS recommended_route TEXT",
    "ALTER TABLE recovery_plans ADD COLUMN IF NOT EXISTS alternate_route TEXT",
    "ALTER TABLE recovery_plans ADD COLUMN IF NOT EXISTS assigned_driver_id INTEGER",
    "ALTER TABLE recovery_plans ADD COLUMN IF NOT EXISTS execution_status VARCHAR(50) DEFAULT 'PENDING'",
]

for query in columns:
    cursor.execute(query)

connection.commit()

print("Recovery plan columns added successfully")

cursor.close()
connection.close()