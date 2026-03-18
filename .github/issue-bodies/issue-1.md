## Goal
Implement optional account creation with email/password while preserving guest mode and browser session persistence.

## Scope
- Signup/login/logout UI and server functions
- Password hashing and validation
- Session cookie/token persisted in browser
- Link/merge guest identity data into user account
- Auth guards for account-only routes (if any)

## Acceptance criteria
- Guest can use app without signup
- User can sign up and log in
- Existing guest entries remain accessible after account linking
- Tests added/updated
