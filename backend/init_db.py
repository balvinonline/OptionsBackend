import sqlite3
import os
import werkzeug.security

DB_PATH = 'app.db'

def init_db():
    # Connect to SQLite (creates the file if it doesn't exist)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Create Users table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL
        )
    ''')

    # Create Market Data table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS market_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            symbol TEXT NOT NULL,
            fii_dii_activity TEXT,
            pcr REAL,
            levels TEXT,
            day_high REAL,
            day_low REAL,
            day_close REAL
        )
    ''')

    # Check if admin user exists, if not, create default admin
    cursor.execute("SELECT id FROM users WHERE username = 'admin'")
    admin = cursor.fetchone()

    if not admin:
        default_password = 'admin'
        hashed_pw = werkzeug.security.generate_password_hash(default_password)
        cursor.execute("INSERT INTO users (username, password_hash) VALUES (?, ?)", ('admin', hashed_pw))
        print("Default admin user created. Username: 'admin', Password: 'admin'")
    else:
        print("Admin user already exists.")

    conn.commit()
    conn.close()
    print("Database initialization complete.")

if __name__ == '__main__':
    init_db()
