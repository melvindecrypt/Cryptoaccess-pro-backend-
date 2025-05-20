describe('getAllPaymentProofs (Admin)', () => {
  it('should return all payment proofs for an admin user', async () => {
    // Create some dummy payment proofs
    await PaymentProof.create({
      userId: regularUserId,
      amount: ACCESS_FEE_USD,
      currency: 'USD',
      proofUrl: '/uploads/paymentProofs/proof1.png',
      status: 'pending',
    });
    await PaymentProof.create({
      userId: regularUserId,
      amount: PRO_PLUS_FEE_USD,
      currency: 'USD',
      proofUrl: '/uploads/proPlusProofs/proof2.png',
      status: 'approved',
      paymentType: 'pro-plus',
    });

    const res = await request(app)
      .get('/api/admin/payment-proofs') // Adjust this route for admin access
      .set('Authorization', `Bearer ${adminToken}`); // Requires admin token

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.paymentProofs).toBeInstanceOf(Array);
    expect(res.body.paymentProofs.length).toEqual(2);
    expect(res.body.paymentProofs[0].userId.email).toEqual('testuser@example.com');
    expect(res.body.paymentProofs[1].userId.email).toEqual('testuser@example.com');
    expect(res.body.paymentProofs.some(p => p.status === 'pending')).toBe(true);
    expect(res.body.paymentProofs.some(p => p.status === 'approved')).toBe(true);
  });

  it('should return an empty array if no payment proofs exist', async () => {
    const res = await request(app)
      .get('/api/admin/payment-proofs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.paymentProofs).toBeInstanceOf(Array);
    expect(res.body.paymentProofs.length).toEqual(0);
  });

  it('should return 500 if an error occurs while fetching payment proofs', async () => {
    jest.spyOn(PaymentProof, 'find').mockImplementationOnce(() => {
      throw new Error('Database read error');
    });

    const res = await request(app)
      .get('/api/admin/payment-proofs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toEqual(500);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toEqual('Failed to fetch payment proofs.');
    expect(res.body.error).toEqual('Database read error');

    jest.restoreAllMocks();
  });
});
