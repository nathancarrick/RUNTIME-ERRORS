from database import get_connection


def create_tables():
    connection = get_connection()
    cursor = connection.cursor()

    # -----------------------------
    # DISRUPTIONS
    # -----------------------------
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS disruptions (
            id SERIAL PRIMARY KEY,
            shipment_id VARCHAR(100) NOT NULL,
            disruption_type VARCHAR(100) NOT NULL,
            severity VARCHAR(50) NOT NULL,
            location VARCHAR(255),
            description TEXT,
            status VARCHAR(50) DEFAULT 'ACTIVE',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # -----------------------------
    # RECOVERY PLANS
    # -----------------------------
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS recovery_plans (
            id SERIAL PRIMARY KEY,
            disruption_id INTEGER REFERENCES disruptions(id),
            priority VARCHAR(50),
            impact_summary TEXT,
            recommended_action TEXT,
            alternative_actions TEXT,
            estimated_delay INTEGER DEFAULT 0,
            estimated_cost NUMERIC(12, 2) DEFAULT 0,
            approval_status VARCHAR(50) DEFAULT 'PENDING',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # -----------------------------
    # USERS
    # -----------------------------
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(100) UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role VARCHAR(20) NOT NULL
                CHECK (role IN ('CUSTOMER', 'DRIVER', 'OPERATOR')),
            full_name VARCHAR(150) NOT NULL,
            email VARCHAR(150),
            phone VARCHAR(30),
            active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # -----------------------------
    # CUSTOMER PROFILES
    # -----------------------------
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS customer_profiles (
            id SERIAL PRIMARY KEY,
            user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            address TEXT,
            city VARCHAR(100),
            pincode VARCHAR(20)
        );
    """)

    # -----------------------------
    # DRIVER PROFILES
    # -----------------------------
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS driver_profiles (
            id SERIAL PRIMARY KEY,
            user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            license_number VARCHAR(100),
            vehicle_number VARCHAR(50),
            vehicle_type VARCHAR(100),
            created_by INTEGER REFERENCES users(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # -----------------------------
    # SHIPMENTS
    # -----------------------------
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS shipments (
            id SERIAL PRIMARY KEY,
            shipment_code VARCHAR(100) UNIQUE NOT NULL,
            customer_id INTEGER REFERENCES users(id),
            driver_id INTEGER REFERENCES users(id),
            origin VARCHAR(255) NOT NULL,
            destination VARCHAR(255) NOT NULL,
            current_location VARCHAR(255),
            status VARCHAR(50) DEFAULT 'PENDING',
            priority VARCHAR(50) DEFAULT 'MEDIUM',
            vehicle_number VARCHAR(50),
            vehicle_type VARCHAR(100),
            estimated_eta TIMESTAMP,
            estimated_delay INTEGER DEFAULT 0,
            updated_eta TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # -----------------------------
    # SHIPMENT EVENTS
    # -----------------------------
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS shipment_events (
            id SERIAL PRIMARY KEY,
            shipment_id INTEGER REFERENCES shipments(id) ON DELETE CASCADE,
            shipment_code VARCHAR(100) NOT NULL,
            event_type VARCHAR(100) NOT NULL,
            description TEXT NOT NULL,
            created_by VARCHAR(150),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # -----------------------------
    # DRIVER RESPONSES
    # -----------------------------
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS driver_responses (
            id SERIAL PRIMARY KEY,
            shipment_code VARCHAR(100) NOT NULL,
            recovery_plan_id INTEGER REFERENCES recovery_plans(id) ON DELETE SET NULL,
            driver_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            response_type VARCHAR(50) NOT NULL,
            issue_type VARCHAR(100),
            severity VARCHAR(50),
            description TEXT,
            suggested_route TEXT,
            reason TEXT,
            estimated_improvement VARCHAR(100),
            status VARCHAR(50) DEFAULT 'PENDING',
            operator_notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # -----------------------------
    # CUSTOMER REQUESTS
    # -----------------------------
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS customer_requests (
            id SERIAL PRIMARY KEY,
            shipment_code VARCHAR(100) NOT NULL,
            customer_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            request_type VARCHAR(100) DEFAULT 'URGENT_DELIVERY',
            message TEXT NOT NULL,
            status VARCHAR(50) DEFAULT 'PENDING',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # -----------------------------
    # INCIDENT HISTORY
    # -----------------------------
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS incident_history (
            id SERIAL PRIMARY KEY,
            shipment_code VARCHAR(100) NOT NULL,
            disruption_id INTEGER REFERENCES disruptions(id) ON DELETE SET NULL,
            recovery_plan_id INTEGER REFERENCES recovery_plans(id) ON DELETE SET NULL,
            disruption_type VARCHAR(100),
            severity VARCHAR(50),
            original_route TEXT,
            recovery_route TEXT,
            operator_decision VARCHAR(50),
            driver_response VARCHAR(50),
            customer_request TEXT,
            final_status VARCHAR(50) DEFAULT 'DELIVERED',
            final_eta TIMESTAMP,
            total_delay INTEGER DEFAULT 0,
            recovery_cost NUMERIC(12, 2) DEFAULT 0,
            incident_outcome TEXT,
            completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # -----------------------------
    # CUSTOMER NOTIFICATIONS
    # -----------------------------
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS customer_notifications (
            id SERIAL PRIMARY KEY,
            customer_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            shipment_code VARCHAR(100) NOT NULL,
            title VARCHAR(255) NOT NULL,
            message TEXT NOT NULL,
            notification_type VARCHAR(50) NOT NULL,
            updated_eta TIMESTAMP,
            action_required BOOLEAN DEFAULT FALSE,
            is_read BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # -----------------------------
    # PRIORITY HISTORY
    # -----------------------------
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS priority_history (
            id SERIAL PRIMARY KEY,
            shipment_code VARCHAR(100) NOT NULL,
            priority_category VARCHAR(50) NOT NULL,
            priority_score NUMERIC NOT NULL,
            previous_category VARCHAR(50),
            reasons TEXT NOT NULL,
            overtaken_note TEXT,
            inputs JSONB DEFAULT '{}',
            triggered_by VARCHAR(100) DEFAULT 'DECISION_ENGINE',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # Ensure recovery_plans columns
    columns = [
        "ALTER TABLE recovery_plans ADD COLUMN IF NOT EXISTS shipment_code VARCHAR(100)",
        "ALTER TABLE recovery_plans ADD COLUMN IF NOT EXISTS recommended_route TEXT",
        "ALTER TABLE recovery_plans ADD COLUMN IF NOT EXISTS alternate_route TEXT",
        "ALTER TABLE recovery_plans ADD COLUMN IF NOT EXISTS assigned_driver_id INTEGER",
        "ALTER TABLE recovery_plans ADD COLUMN IF NOT EXISTS execution_status VARCHAR(50) DEFAULT 'PENDING'",
        "ALTER TABLE recovery_plans ADD COLUMN IF NOT EXISTS risk_level VARCHAR(50) DEFAULT 'LOW'",
        "ALTER TABLE recovery_plans ADD COLUMN IF NOT EXISTS operator_override_reason TEXT DEFAULT ''",
        # shipments columns
        "ALTER TABLE shipments ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'STANDARD_CARGO'",
        "ALTER TABLE shipments ADD COLUMN IF NOT EXISTS deadline TIMESTAMP",
        "ALTER TABLE shipments ADD COLUMN IF NOT EXISTS priority_category VARCHAR(10) DEFAULT 'P3'",
        "ALTER TABLE shipments ADD COLUMN IF NOT EXISTS priority_score NUMERIC DEFAULT 50.0",
        "ALTER TABLE shipments ADD COLUMN IF NOT EXISTS priority_explanation TEXT DEFAULT 'Standard priority based on normal transit SLA.'",
        "ALTER TABLE shipments ADD COLUMN IF NOT EXISTS overtaken_note TEXT DEFAULT ''",
        "ALTER TABLE shipments ADD COLUMN IF NOT EXISTS remaining_distance_km NUMERIC DEFAULT 510.0",
        "ALTER TABLE shipments ADD COLUMN IF NOT EXISTS remaining_duration_mins INTEGER DEFAULT 480",
        # driver_responses columns
        "ALTER TABLE driver_responses ADD COLUMN IF NOT EXISTS observed_road_condition TEXT DEFAULT ''",
        "ALTER TABLE driver_responses ADD COLUMN IF NOT EXISTS estimated_delay_minutes INTEGER DEFAULT 0",
        "ALTER TABLE driver_responses ADD COLUMN IF NOT EXISTS driver_notes TEXT DEFAULT ''",
        "ALTER TABLE driver_responses ADD COLUMN IF NOT EXISTS validation_status VARCHAR(50) DEFAULT 'PENDING'",
        "ALTER TABLE driver_responses ADD COLUMN IF NOT EXISTS validation_details JSONB DEFAULT '{}'",
        "ALTER TABLE driver_responses ADD COLUMN IF NOT EXISTS proposed_waypoints TEXT DEFAULT ''",
        # customer_requests columns
        "ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS urgency_level VARCHAR(20) DEFAULT 'HIGH'",
        "ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS operator_decision VARCHAR(20) DEFAULT 'PENDING'",
        "ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS operator_notes TEXT DEFAULT ''",
        # users profile & security columns
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo_path VARCHAR(255)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS state VARCHAR(100) DEFAULT 'Tamil Nadu'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_notification_method VARCHAR(20) DEFAULT 'IN_APP'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP",
        # customer_profiles state
        "ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS state VARCHAR(100) DEFAULT 'Tamil Nadu'",
        # driver_profiles availability
        "ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS availability_status VARCHAR(50) DEFAULT 'AVAILABLE'",
    ]
    for col_query in columns:
        cursor.execute(col_query)

    # -----------------------------
    # PASSWORD RESET OTPS
    # -----------------------------
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS password_reset_otps (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            otp_hash VARCHAR(255) NOT NULL,
            purpose VARCHAR(50) DEFAULT 'PASSWORD_RESET',
            delivery_target VARCHAR(255) NOT NULL,
            delivery_channel VARCHAR(20) NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            attempts INTEGER DEFAULT 0,
            max_attempts INTEGER DEFAULT 5,
            is_used BOOLEAN DEFAULT FALSE,
            reset_token VARCHAR(255),
            reset_token_expires_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_pw_reset_user ON password_reset_otps(user_id);
    """)

    # -----------------------------
    # SECURITY EVENTS
    # -----------------------------
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS security_events (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            event_type VARCHAR(50) NOT NULL,
            description TEXT NOT NULL,
            ip_address VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_sec_events_user ON security_events(user_id);
    """)

    connection.commit()
    cursor.close()
    connection.close()

    print("LOGIAID database tables and extensions created successfully")


if __name__ == "__main__":
    create_tables()