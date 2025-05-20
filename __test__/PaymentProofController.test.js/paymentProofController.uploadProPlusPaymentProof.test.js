describe('uploadProPlusPaymentProof', () => {
  it('should upload a file and create a pending Pro+ payment proof', async () => {
    const dummyFilePath = createDummyImage('test-proplus-proof.png');

    const res = await request(app)
      .post('/api/payment/upload-pro-plus-proof') // Adjust this route
      .set('Authorization', `Bearer ${regularUserToken}`)
      .attach('proPlusPaymentProof', dummyFilePath); // 'proPlusPaymentProof' should match your Multer field name

    expect(res.statusCode).toEqual(201);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toEqual('Pro+ payment proof uploaded successfully. Awaiting verification.');
    expect(res.body.proofId).toBeDefined();
    expect(res.body.status).toEqual('pending');
    expect(res.body.paymentType).toEqual('pro-plus');

    const createdProof = await PaymentProof.findById(res.body.proofId);
    expect(createdProof).toBeDefined();
    expect(createdProof.userId.toString()).toEqual(regularUserId.toString());
    expect(createdProof.amount).toEqual(PRO_PLUS_FEE_USD);
    expect(createdProof.currency).toEqual('USD');
    expect(createdProof.proofUrl).toMatch(/\/uploads\/proPlusProofs\/test-proplus-proof\.png/);
    expect(createdProof.status).toEqual('pending');
    expect(createdProof.paymentType).toEqual('pro-plus');
  });

  it('should return 400 if no file is uploaded for Pro+', async () => {
    const res = await request(app)
      .post('/api/payment/upload-pro-plus-proof')
      .set('Authorization', `Bearer ${regularUserToken}`);

    expect(res.statusCode).toEqual(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toEqual('No Pro+ payment proof uploaded.');
  });

  it('should return 500 if an error occurs during saving Pro+ payment proof', async () => {
    const dummyFilePath = createDummyImage('error-proplus-proof.png');

    jest.spyOn(PaymentProof.prototype, 'save').mockImplementationOnce(() => {
      throw new Error('Pro+ database write error');
    });

    const res = await request(app)
      .post('/api/payment/upload-pro-plus-proof')
      .set('Authorization', `Bearer ${regularUserToken}`)
      .attach('proPlusPaymentProof', dummyFilePath);

    expect(res.statusCode).toEqual(500);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toEqual('Server error.');
    expect(res.body.error).toEqual('Pro+ database write error');

    jest.restoreAllMocks();
  });
});
