import Joi from 'joi';

const validateProPlusPayment = (paymentData) => {
  const schema = Joi.object({
    userId: Joi.string()
      .required()
      .messages({
        'string.empty': 'User ID is required.',
        'any.required': 'User ID is required.',
      }),
    transactionId: Joi.string()
      .required()
      .messages({
        'string.empty': 'Transaction ID is required.',
        'any.required': 'Transaction ID is required.',
      }),
    // Optional fields for additional payment details
    paymentMethod: Joi.string().optional(),
    paymentDate: Joi.date().optional(),
    amountPaid: Joi.number().positive().optional(),
  });

  return schema.validate(paymentData);
};

export { validateProPlusPayment };