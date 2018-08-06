require 'active_support/concern'
require 'base64'
module RailsEncryptedToken
  module TokenEncryptable

    class BadTokenError < StandardError; end

    extend ActiveSupport::Concern

    class << self
      attr_accessor :handle_when
    end

    included do
      before_action :handle_encrypted_tokens

      def need_to_handle?
        handler = RailsEncryptedToken::TokenEncryptable.handle_when
        case handler
        when Proc then instance_exec &handler
        else handler
        end
      end

      def handle_encrypted_tokens
        if ! need_to_handle?
          return
        end

        token = encrypted_token_from_request
        nonce = initial_nonce_from_request

        if token.nil?
          encrypt_initial_nonce
        else
          validate_encrypted_token
        end
      end

      def encrypt_initial_nonce
        nonce = initial_nonce_from_request
        puts "yo generating, from nonce = #{nonce.pretty_inspect}"
        raise BadTokenError if ! %i[get head].include?(request.method_symbol) && nonce.nil?
        return if nonce.nil?

        token = generate_token(nonce)
        puts "yo generated token is #{token}"
        response.set_header(encrypted_token_param_name, token)
        response.set_header(initial_nonce_param_name, nonce)
      end

      def validate_encrypted_token
        token = encrypted_token_from_request
        nonce = initial_nonce_from_request

        is_valid = token_valid?(nonce, token)
        puts "is it valid? #{is_valid}"

        if ! is_valid
          render json: {
            errors: "Bad token"
          }, status: 401
        end
      end

      def initial_nonce_param_name
        'X-Initial-Nonce'
      end

      def encrypted_token_param_name
        'X-Encrypted-Token'
      end

      def initial_nonce_from_request
        request.headers[initial_nonce_param_name]
      end

      def encrypted_token_from_request
        request.headers[encrypted_token_param_name]
      end

      def generate_token(nonce)
        serialize_token RailsEncryptedToken::Token.generate_token(nonce)
      end

      def token_valid?(nonce, token)
        RailsEncryptedToken::Token.token_valid?(nonce, deserialize_token(token))
      rescue BadTokenError
        false
      end

      def serialize_token(token)
        Base64.strict_encode64 Marshal.dump token
      end

      def deserialize_token(token)
        Marshal.load Base64.strict_decode64 token
      rescue ArgumentError
        raise BadTokenError
      end
    end

    class_methods do
    end

  end
end
