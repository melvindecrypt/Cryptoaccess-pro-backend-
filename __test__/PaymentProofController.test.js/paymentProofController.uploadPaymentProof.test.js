describe('uploadPaymentProof', () => {
  it('should upload a file and create a pending payment proof', async () => {
    const dummyFilePath = createDummyImage('test-proof.png');

    const res = await request(app)
      .post('/api/payment/upload-proof') // Adjust this route
      .set('Authorization', `Bearer ${regularUserToken}`)
      .attach('paymentProof', dummyFilePath); // 'paymentProof' should match your Multer field name

    expect(res.statusCode).toEqual(201);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toEqual('Payment proof uploaded successfully. Awaiting verification.');
    expect(res.body.proofId).toBeDefined();
    expect(res.body.status).toEqual('pending');

    const createdProof = await PaymentProof.findById(res.body.proofId);
    expect(createdProof).toBeDefined();
    expect(createdProof.userId.toString()).toEqual(regularUserId.toString());
    expect(createdProof.amount).toEqual(ACCESS_FEE_USD);
    expect(createdProof.currency).toEqual('USD');
    expect(createdProof.proofUrl).toMatch(/\/uploads\/paymentProofs\/test-proof\.png/); // Check filename consistency
    expect(createdProof.status).toEqual('pending');
    expect(createdProof.paymentType).toBeUndefined(); // Should be undefined for access fee
  });

  it('should return 400 if no file is uploaded', async () => {
    const res = await request(app)
      .post('/api/payment/upload-proof')
      .set('Authorization', `Bearer ${regularUserToken}`);

    expect(res.statusCode).toEqual(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toEqual('No payment proof uploaded.');
  });

  it('should return 500 if an error occurs during saving the payment proof', async () => {
    const dummyFilePath = createDummyImage('error-proof.png');

    jest.spyOn(PaymentProof.prototype, 'save').mockImplementationOnce(() => {
      throw new Error('Database write error');
    });

    const res = await request(app)
      .post('/api/payment/upload-proof')
      .set('Authorization', `Bearer ${regularUserToken}`)
      .attach('paymentProof', dummyFilePath);

    expect(res.statusCode).toEqual(500);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toEqual('Server error.');
    expect(res.body.error).toEqual('Database write error');

    jest.restoreAllMocks();
  });
});
