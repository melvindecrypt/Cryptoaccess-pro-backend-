describe('shareReferralLink', () => {
  it('should generate and return referral link if no recipient email is provided', async () => {
    const res = await request(app)
      .post('/api/referral/share') // Adjust your route
      .set('Authorization', `Bearer ${userToken}`)
      .send({}); // No recipient_email

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toEqual('Referral link generated');
    expect(res.body.data.referralLink).toEqual('http://localhost:3000/register?ref=REFERCODE123');
    expect(emailService.sendReferralEmail).not.toHaveBeenCalled();
  });

  it('should send referral email and return success message if recipient email is provided', async () => {
    const recipientEmail = 'friend@example.com';
    emailService.sendReferralEmail.mockResolvedValue(true); // Mock successful email send

    const res = await request(app)
      .post('/api/referral/share')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ recipient_email: recipientEmail });

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toEqual('Referral link shared successfully');
    expect(emailService.sendReferralEmail).toHaveBeenCalledWith(
      recipientEmail,
      'http://localhost:3000/register?ref=REFERCODE123',
      'referrer@example.com'
    );
  });

  it('should return 404 if user not found when sharing link', async () => {
    jest.spyOn(User, 'findById').mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/api/referral/share')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ recipient_email: 'friend@example.com' });

    expect(res.statusCode).toEqual(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toEqual('User not found');
  });

  it('should return 500 if email sending fails', async () => {
    const recipientEmail = 'badfriend@example.com';
    emailService.sendReferralEmail.mockRejectedValueOnce(new Error('Email service down'));

    const res = await request(app)
      .post('/api/referral/share')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ recipient_email: recipientEmail });

    expect(res.statusCode).toEqual(500);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toEqual('Failed to send referral email');
    expect(res.body.data.error).toEqual('Email service down');
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(`Error sending referral email for user ${userId} to ${recipientEmail}: Email service down`));

    jest.restoreAllMocks();
  });

  it('should return 500 if a general server error occurs during link sharing', async () => {
    jest.spyOn(User, 'findById').mockImplementationOnce(() => {
      throw new Error('General database error');
    });

    const res = await request(app)
      .post('/api/referral/share')
      .set('Authorization', `Bearer ${userToken}`)
      .send({});

    expect(res.statusCode).toEqual(500);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toEqual('Failed to share referral link');
    expect(res.body.data.error).toEqual('General database error');
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(`Error sharing referral link for user ${userId}: General database error`));

    jest.restoreAllMocks();
  });
});
