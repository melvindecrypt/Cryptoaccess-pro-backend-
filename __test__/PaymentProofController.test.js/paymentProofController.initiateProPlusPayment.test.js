describe('initiateProPlusPayment', () => {
  it('should return 200 status with Pro+ fee and payment addresses for a regular user', async () => {
    const res = await request(app)
      .get('/api/payment/initiate-pro-plus-payment') // Adjust this route
      .set('Authorization', `Bearer ${regularUserToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toEqual('Initiate Pro+ subscription payment.');
    expect(res.body.fee).toEqual(PRO_PLUS_FEE_USD);
    expect(res.body.paymentAddresses).toBeDefined();
    expect(res.body.paymentAddresses.BTC).toBe('mockbtcaddress');
    expect(res.body.paymentAddresses['USDT (TRC20)']).toBe('mockusdttrc20address');
    expect(res.body.user.id).toEqual(regularUserId.toString());
  });

  it('should return 500 if an unexpected error occurs', async () => {
    jest.spyOn(User, 'findById').mockImplementationOnce(() => {
      throw new Error('Pro+ payment initiation failed');
    });

    const res = await request(app)
      .get('/api/payment/initiate-pro-plus-payment')
      .set('Authorization', `Bearer ${regularUserToken}`);

    expect(res.statusCode).toEqual(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toEqual('Server Error');
    expect(res.body.message).toEqual('Pro+ payment initiation failed');

    jest.restoreAllMocks();
  });
});
