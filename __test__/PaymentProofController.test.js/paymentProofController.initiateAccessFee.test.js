describe('initiateAccessFee', () => {
  it('should return 200 status with access fee and payment addresses for a regular user', async () => {
    const res = await request(app)
      .get('/api/payment/initiate-access-fee') // Adjust this route to your actual route
      .set('Authorization', `Bearer ${regularUserToken}`); // Assuming JWT authentication

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toEqual('Initiate access fee payment.');
    expect(res.body.fee).toEqual(ACCESS_FEE_USD);
    expect(res.body.paymentAddresses).toBeDefined();
    expect(res.body.paymentAddresses.BTC).toBe('mockbtcaddress');
    expect(res.body.paymentAddresses['USDT (ERC20)']).toBe('mockusdterc20address');
    expect(res.body.user.id).toEqual(regularUserId.toString());
  });

  it('should return 500 if an unexpected error occurs', async () => {
    // Mocking an error to test the catch block
    jest.spyOn(User, 'findById').mockImplementationOnce(() => {
      throw new Error('Database connection failed');
    });

    const res = await request(app)
      .get('/api/payment/initiate-access-fee')
      .set('Authorization', `Bearer ${regularUserToken}`);

    expect(res.statusCode).toEqual(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toEqual('Server Error');
    expect(res.body.message).toEqual('Database connection failed');

    // Restore original implementation
    jest.restoreAllMocks();
  });
});
