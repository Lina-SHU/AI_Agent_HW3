// Applied before app/database imports; never use the project's SQLite file.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'integration-only-jwt-secret';
process.env.ADMIN_EMAIL = 'admin@hexschool.com';
process.env.ADMIN_PASSWORD = '12345678';
process.env.ECPAY_ENV = 'stage';
process.env.ECPAY_MERCHANT_ID = '3002607';
process.env.ECPAY_HASH_KEY = 'pwFHCqoQZGmho4w6';
process.env.ECPAY_HASH_IV = 'EkRm7iFT261dpevs';
process.env.BASE_URL = 'http://localhost:3001';
