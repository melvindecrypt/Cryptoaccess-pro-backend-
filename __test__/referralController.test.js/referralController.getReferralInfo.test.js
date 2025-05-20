describe('getReferralInfo', () => {
  it('should return referral information successfully for a logged-in user', async () => {
    const res = await request(app)
      .get('/api/referral/info') // Adjust your route
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toEqual('Referral information retrieved successfully');
    expect(res.body.data.referral_code).toEqual('REFERCODE123');
    expect(res.body.data.referralLink).toEqual('http://localhost:3000/register?ref=REFERCODE123');
    expect(res.body.data.total_referrals).toEqual(3);
    expect(res.body.data.total_earned).toEqual(REFERRAL_REWARD_AMOUNT); // Only one approved referral
    expect(res.body.data.approved_referrals_count).toEqual(1);
    expect(res.body.data.pending_referrals_count).toEqual(1); // One referred user with accessPaymentCompleted: false

    expect(res.body.data.referred_users).toBeInstanceOf(Array);
    expect(res.body.data.referred_users.length).toEqual(3);

    // Check referred user statuses
    const referredUser1 = res.body.data.referred_users.find(u => u.email === 'referred1@example.com');
    expect(referredUser1.referralStatus).toEqual('active');
    expect(referredUser1.earnedAmount).toEqual(0);

    const referredUser2 = res.body.data.referred_users.find(u => u.email === 'referred2@example.com');
    expect(referredUser2.referralStatus).toEqual('approved');
    expect(referredUser2.earnedAmount).toEqual(REFERRAL_REWARD_AMOUNT);

    const referredUser3 = res.body.data.referred_users.find(u => u.email === 'referred3@example.com');
    expect(referredUser3.referralStatus).toEqual('payment pending');
    expect(referredUser3.earnedAmount).toEqual(0);

    expect(res.body.data.referral_reward_amount).toEqual(REFERRAL_REWARD_AMOUNT);
  });

  it('should return 404 if user not found', async () => {
    // Mock User.findById to return null
    jest.spyOn(User, 'findById').mockResolvedValueOnce(null);

    const res = await request(app)
      .get('/api/referral/info')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.statusCode).toEqual(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toEqual('User not found');
  });

  it('should return 500 if a server error occurs', async () => {
    jest.spyOn(User, 'findById').mockImplementationOnce(() => {
      throw new Error('Database error during referral info fetch');
    });

    const res = await request(app)
      .get('/api/referral/info')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.statusCode).toEqual(500);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toEqual('Failed to retrieve referral information');
    expect(res.body.data.error).toEqual('Database error during referral info fetch');
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error fetching referral info for user'));

    jest.restoreAllMocks();
  });
});
