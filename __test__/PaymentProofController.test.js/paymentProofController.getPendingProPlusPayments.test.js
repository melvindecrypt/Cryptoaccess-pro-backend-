describe('getPendingProPlusPayments (Admin)', () => {
  it('should return only pending Pro+ payment proofs', async () => {
    // Create some payment proofs
    await PaymentProof.create({
      userId: regularUserId,
      amount: ACCESS_FEE_USD,
      currency: 'USD',
      proofUrl: '/uploads/paymentProofs/proof1.png',
      status: 'pending', // Access fee pending
    });
    await PaymentProof.create({
      userId: regularUserId,
      amount: PRO_PLUS_FEE_USD,
      currency: 'USD',
      proofUrl: '/uploads/proPlusProofs/proof2.png',
      status: 'pending',
      paymentType: 'pro-plus', // Pro+ pending
    });
    await PaymentProof.create({
      userId: regularUserId,
      amount: PRO_PLUS_FEE_USD,
      currency: 'USD',
      proofUrl: '/uploads/proPlusProofs/proof3.png',
      status: 'approved',
      paymentType: 'pro-plus', // Pro+ approved
    });

    const res = await request(app)
      .get('/api/admin/pending-pro-plus-payments') // Adjust route
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.pendingProPlusProofs).toBeInstanceOf(Array);
    expect(res.body.pendingProPlusProofs.length).toEqual(1);
    expect(res.body.pendingProPlusProofs[0].status).toEqual('pending');
    expect(res.body.pendingProPlusProofs[0].paymentType).toEqual('pro-plus');
    expect(res.body.pendingProPlusProofs[0].userId.email).toEqual('testuser@example.com');
  });

  it('should return an empty array if no pending Pro+ payments exist', async () => {
    // Only access fee pending proof exists
    await PaymentProof.create({
      userId: regularUserId,
      amount: ACCESS_FEE_USD,
      currency: 'USD',
      proofUrl: '/uploads/paymentProofs/proof1.png',
      status: 'pending',
    });

    const res = await request(app)
      .get('/api/admin/pending-pro-plus-payments')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.pendingProPlusProofs).toBeInstanceOf(Array);
    expect(res.body.pendingProPlusProofs.length).toEqual(0);
  });

  it('should return 500 if an error occurs while fetching pending Pro+ payments', async () => {
    jest.spyOn(PaymentProof, 'find').mockImplementationOnce(() => {
      throw new Error('Pro+ pending payments database error');
    });

    const res = await request(app)
      .get('/api/admin/pending-pro-plus-payments')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toEqual(500);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toEqual('Failed to fetch pending Pro+ payments.');
    expect(res.body.error).toEqual('Pro+ pending payments database error');

    jest.restoreAllMocks();
  });
});
