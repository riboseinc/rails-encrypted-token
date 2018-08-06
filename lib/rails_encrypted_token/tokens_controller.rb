# Use the endpoints in this controller to fetch the initial encrypted token.
module RailsEncryptedToken
  class TokensController < ActionController::Base

    include RailsEncryptedToken::TokenEncryptable

    alias csrf_token encrypt_initial_nonce
  end
end
