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
│   ├── constants.js
│   ├── db.js
│   ├── fileStorage.js
│   ├── walletAddresses.js 
├── controllers/
│   ├── adminController.js
│   ├── authController.js
│   ├── chartController.js
│   ├── currencyController.js
│   ├── exchangeController.js
│   ├── referralController.js
│   ├── investmentController.js
│   ├── kycController.js
│   ├── paymentProofController.js 
│   ├── subscriptionController.js
│   ├── userController.js
│   ├── walletController.js
│   └── withdrawalController.js
├── middleware/
│   ├── validators/
│   │   ├── adminValidators.js
│   ├── adminAuth.js
│   ├── auditMiddleware.js
│   ├── authMiddleware.js
│   ├── localStorageAccess.js
│   ├── requireVerifiedEmail.js
│   └── requireKyc.js
├── models/
│   ├── AdminWallet.js
│   ├── ArchiveUser.js
│   ├── AuditLog.js
│   ├── currency.js
│   ├── investment.js
│   ├── investmentPlan.js
│   ├── Notification.js
│   ├── PaymentProof.js 
│   ├── Settings.js
│   ├── Transaction.js
│   ├── User.js
│   ├── Wallet.js
│   └── Withdrawals.js
├── routes/
│   ├── admin.js
│   ├── adminSettings.js 
│   ├── audit.js
│   ├── auth.js
│   ├── charts.js
│   ├── currency.js
│   ├── exchange.js
│   ├── investments.js
│   ├── kyc.js
│   ├── notifications.js
│   ├── payments.js
│   ├── propPlus.js
│   ├── referrals.js
│   ├── subscription.js
│   ├── user.js
│   ├── withdrawal.js
│   ├── wallets.js
│   └── walletTransfer.js
├── services/
│   ├── auditService.js
│   ├── notificationService.js
│   ├── payoutService.js
│   ├── simulationService.js 
├── seed/
│   ├──seedCurrencies.js 
├── templates/
│   ├── email/
│   ├── investmentCancelled.hbs
│   ├── investmentConfirmed.hbs
│   ├── kycApproved.hbs
│   ├── kycRejected.hbs
│   ├── subscriptionSuccess.hbs
│   ├── withdrawalProcessed.hbs
│   └── withdrawalRejected.hbs
├── uploads/
│   ├── kyc/
│   ├── paymentProof/
├── utils/
│   ├── errors/
│   ├── emailService.js
│   ├── helpers.js
│   ├── logger.js
├── validators/
│   ├── subscriptionValidators.js
├── server.js
├── package.json
└── package-lock.json
