describe('updateProofStatus (Admin)', () => {
  let paymentProofId;
  let proPlusPaymentProofId;

  beforeEach(async () => {
    const proof = await PaymentProof.create({
      userId: regularUserId,
      amount: ACCESS_FEE_USD,
      currency: 'USD',
      proofUrl: '/uploads/paymentProofs/proof-access.png',
      status: 'pending',
    });
    paymentProofId = proof._id;

    const proPlusProof = await PaymentProof.create({
      userId: regularUserId,
      amount: PRO_PLUS_FEE_USD,
      currency: 'USD',
      proofUrl: '/uploads/proPlusProofs/proof-proplus.png',
      status: 'pending',
      paymentType: 'pro-plus',
    });
    proPlusPaymentProofId = proPlusProof._id;
  });

  it('should update status to "approved" for general access and grant user access', async () => {
    const res = await request(app)
      .put(`/api/admin/payment-proofs/${paymentProofId}/status`) // Adjust route
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'approved' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toEqual('Payment proof status updated to approved');
    expect(res.body.paymentProof.status).toEqual('approved');

    const updatedUser = await User.findById(regularUserId);
    expect(updatedUser.accessStatus).toEqual('granted');
  });

  it('should update status to "rejected" without affecting user access', async () => {
    const res = await request(app)
      .put(`/api/admin/payment-proofs/${paymentProofId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'rejected' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toEqual('Payment proof status updated to rejected');
    expect(res.body.paymentProof.status).toEqual('rejected');

    const updatedUser = await User.findById(regularUserId);
    expect(updatedUser.accessStatus).toEqual('pending'); // Still pending
  });

  it('should return 404 if payment proof not found', async () => {
    const nonExistentId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .put(`/api/admin/payment-proofs/${nonExistentId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'approved' });

    expect(res.statusCode).toEqual(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toEqual('Payment proof not found.');
  });

  it('should return 400 for invalid status value', async () => {
    const res = await request(app)
      .put(`/api/admin/payment-proofs/${paymentProofId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'invalid_status' });

    expect(res.statusCode).toEqual(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toEqual('Invalid status value. Expected "approved" or "rejected".');
  });

  it('should handle "approved" status for "pro-plus" payment type, updating user subscription', async () => {
    // Mock req.user for the admin making the update
    jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValueOnce({
        _id: adminUserId,
        email: 'admin@example.com'
    });

    const res = await request(app)
      .put(`/api/admin/payment-proofs/${proPlusPaymentProofId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'approved' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toEqual('Payment proof status updated to approved');
    expect(res.body.paymentProof.status).toEqual('approved');
    expect(res.body.paymentProof.paymentType).toEqual('pro-plus');

    const updatedUser = await User.findById(regularUserId);
    expect(updatedUser.subscription.isProPlus).toBe(true);
    expect(updatedUser.subscription.paymentStatus).toEqual('verified');
    expect(updatedUser.subscription.subscribedAt).toBeInstanceOf(Date);
    expect(updatedUser.subscription.expiresAt).toBeInstanceOf(Date);
    expect(updatedUser.subscriptionHistory.length).toBe(1);
    expect(updatedUser.subscriptionHistory[0].verifiedBy.toString()).toEqual(adminUserId.toString());
  });

  it('should return 500 if an error occurs during status update', async () => {
    jest.spyOn(PaymentProof, 'findByIdAndUpdate').mockImplementationOnce(() => {
      throw new Error('Database update error');
    });

    const res = await request(app)
      .put(`/api/admin/payment-proofs/${paymentProofId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'approved' });

    expect(res.statusCode).toEqual(500);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toEqual('Failed to update payment proof status.');
    expect(res.body.error).toEqual('Database update error');

    jest.restoreAllMocks();
  });

  it('should return 500 if user associated with Pro+ proof is not found during approval', async () => {
    // Make sure user ID is invalid
    const invalidUserId = new mongoose.Types.ObjectId();
    const proPlusProofWithInvalidUser = await PaymentProof.create({
      userId: invalidUserId,
      amount: PRO_PLUS_FEE_USD,
      currency: 'USD',
      proofUrl: '/uploads/proPlusProofs/proof-proplus-invalid.png',
      status: 'pending',
      paymentType: 'pro-plus',
    });

    const res = await request(app)
      .put(`/api/admin/payment-proofs/${proPlusProofWithInvalidUser._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'approved' });

    expect(res.statusCode).toEqual(500);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toEqual('Internal error: Could not find user associated with proof.');
  });
});
