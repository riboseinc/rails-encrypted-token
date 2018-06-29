# (c) Copyright 2018 Ribose Inc.
#

require "rotp"
require "base32"
require "ffxcodec"
require "digest/sha1"

module RailsEncryptedToken
  module Token
    class KeyNotFoundError < RuntimeError; end

    class << self
      def generate_token(identifier)
        Web.generate_token(identifier)
      end

      def token_valid?(identifier, token)
        Web.token_valid?(identifier, token)
      end
    end

    # TODO: for web clients (ribose-ruby, ribose-cli, etc.)
    # Client needs to provide a nonce, which is to be used as input
    module Web

      # default: 1 time block is 5 seconds long
      @time_divisor = 5

      # default: 1 hour in seconds
      @raw_valid_interval = 3600

      class << self
        # These are configurable, e.g., from config/initializers/:
        attr_writer :secret_key
        attr_accessor :raw_valid_interval, :time_divisor

        # make sure @valid_interval aligns with multiples
        # of @time_divisor
        def valid_interval
          (@raw_valid_interval / @time_divisor).floor * @time_divisor
        end

        def secret_key
          #
          if @secret_key.blank?
            raise KeyNotFoundError
          end
          @secret_key
        end

        def encryptor(client_nonce)
          # 16-byte hexidecimal number
          client_hash = Digest::SHA1.hexdigest(client_nonce)[0..31]

          # 32-bits in the first tuple element, 0 in the last
          ffxencode = FFXCodec.new(32, 0)
          ffxencode.setup_encryption(client_hash, secret_key)
          ffxencode
        end

        # Convert from "generation +time+" to "block"
        def time_to_block(time)
          Rational(time / time_divisor).floor * time_divisor
        end

        # TODO: do some format validation for this client_nonce
        def generate_token(client_nonce)
          generation_time = time_to_block(Time.now.to_i)
          encryptor(client_nonce).encode(generation_time, 0)
        end

        # token can be a string or integer
        def token_valid?(client_nonce, token)
          gen_time, _dontcare = encryptor(client_nonce).decode(token)

          time_diff = Time.now - Time.at(time_to_block(gen_time))
          time_diff < valid_interval && time_diff > 0
        rescue ArgumentError
          false
        end
      end
    end
  end
end
