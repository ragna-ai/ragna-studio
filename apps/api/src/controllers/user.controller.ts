import { Hono } from 'hono';
import { NotFoundException } from '../exceptions';
import { authMiddleware } from '../middlewares/authMiddleware';
// import { validUpdateUserProfileJson } from '../middlewares/validationMiddlewares';

export const userController = new Hono()
  .basePath('/user')
  .use(authMiddleware)
  /**
   * [GET] /user/profile
   * Get User Profile
   */
  .get('/profile', (c) => {
    const user = c.get('user');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return c.json({ user });
  });
/**
 * [PATCH] /user/profile
 * Update User Profile
 */
// .patch('/profile', validUpdateUserProfileJson, async (c) => {
//   const user = c.get('user');
//   const { name } = c.req.valid('json');

//   if (!user) {
//     throw new NotFoundException('User not found');
//   }

//   const { error, data } = await tryCatch(() => updateUser({ id: user.id, name }));

//   if (error !== null) {
//     logError('Update User Profile', error);
//     throw new InternalServerErrorException('Failed to update user profile');
//   }

//   return c.json({
//     user: data,
//   });
// });
