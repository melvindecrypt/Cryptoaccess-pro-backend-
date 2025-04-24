CryptoAccess Pro Backend

This is the backend for **CryptoAccess Pro**, a simulation platform that mimics a crypto exchange app like Binance. It includes user management, virtual wallets, referral system, investment logic, admin controls, and KYC handling.

---

## Features

- **User Authentication**
  - Secure password hashing with bcrypt
  - Email validation & login security (with lockout protection)
  - Password history tracking
- **Wallet System**
  - Unique wallet ID generation
  - Virtual balances for BTC, ETH, USDT, etc.
  - Transaction logging (deposit, withdrawal, transfer)
- **Referral System**
  - Unique referral code generation
  - Referral tracking and rewards
- **KYC Compliance**
  - Document upload & review system
  - KYC status tracking (pending, approved, rejected)
- **Admin Dashboard**
  - Approve users, KYC, transactions
  - Suspend or verify users
  - Send virtual funds to users
- **Investments**
  - Plan-based investment system with automated ROI
  - Admin management of investment logic
- **Simulated P2P Trading & Exchange**
  - Admin-controlled virtual trading logic

---

## File Structure

```plaintext
.  
├── config/
│   ├── db.js
├── controllers/  
│   ├── authController.js  
│   ├── investmentController.js  
│   ├── userController.js  
│   └── walletController.js  
├── middleware/  
│   ├── adminAuth.js  
│   ├── authMiddleware.js  
│   └── requireKyc.js  
├── models/  
│   ├── User.js  
│   └── Wallet.js  
├── routes/  
│   ├── admin.js  
│   ├── auth.js  
│   ├── investments.js  
│   ├── payments.js  
│   └── wallets.js  
├── utils/ 
│   ├── emailservice.js
│   ├── logger.js
├── server.js  
└── package.json
