# (c) Copyright 2018 Ribose Inc.
#

require "spec_helper"

RSpec.describe RailsEncryptedToken::Token do
  before :all do
    RailsEncryptedToken::Token::Web.secret_key = "some random string of secret"
  end

  shared_examples_for "blank secret_key" do
    context "without a secret_key" do
      before do
        @old_secret_key = RailsEncryptedToken::Token::Web.secret_key
        RailsEncryptedToken::Token::Web.secret_key = ""
      end

      after do
        RailsEncryptedToken::Token::Web.secret_key = @old_secret_key
      end

      it "raises KeyNotFoundError" do
        expect(action).to raise_error described_class::KeyNotFoundError
      end
    end
  end

  describe ".generate_token" do
    subject { described_class }
    let(:nonce) { "nonce1" }

    context "with 2 different nonces" do
      let(:nonce1) { nonce }
      let(:nonce2) { "#{nonce1}2" }

      let(:generated_token1) do
        described_class.generate_token(nonce1)
      end

      let(:generated_token2) do
        described_class.generate_token(nonce2)
      end

      it "generates different generated_tokens" do
        expect(generated_token1).to_not eq generated_token2
      end
    end

    context "with the same nonces" do
      let(:nonce1) { nonce }
      let(:nonce2) { nonce }

      subject(:generated_token1) do
        described_class.generate_token(nonce1)
      end

      let(:generated_token2) do
        described_class.generate_token(nonce2)
      end

      context "when generated at around the same time" do
        before do
          Timecop.freeze
        end

        after do
          Timecop.return
        end

        it { is_expected.to eq generated_token2 }
      end

      context "when generated at times some time apart" do
        let(:generation_time) { Time.local(2008, 9, 1, 12, 14, 15) }
        before do
          @old_divisor = described_class::Web.time_divisor
          described_class::Web.time_divisor = time_divisor

          Timecop.freeze(generation_time)
          generated_token1
          Timecop.freeze(generation_time + time_delta)
          generated_token2
        end

        after do
          Timecop.return
          described_class::Web.time_divisor = @old_divisor
        end

        context "using 2-second blocks" do
          let!(:time_divisor) { 2 }

          context "(0 second)" do
            let(:time_delta) { 0 }

            it { is_expected.to eq generated_token2 }
          end

          context "(2 seconds)" do
            let(:time_delta) { 2 }

            it { is_expected.to_not eq generated_token2 }
          end

          context "(3 seconds)" do
            let(:time_delta) { 3 }

            it { is_expected.to_not eq generated_token2 }
          end
        end

        context "using 5-second blocks" do
          let!(:time_divisor) { 5 }

          context "(0 second)" do
            let(:time_delta) { 0 }

            it { is_expected.to eq generated_token2 }
          end

          context "(5 seconds)" do
            let(:time_delta) { 5 }

            it { is_expected.to_not eq generated_token2 }
          end

          context "(10 seconds)" do
            let(:time_delta) { 10 }

            it { is_expected.to_not eq generated_token2 }
          end

          context "(5000 seconds)" do
            let(:time_delta) { 5000 }

            it { is_expected.to_not eq generated_token2 }
          end
        end

        context "using 3600-second blocks" do
          let!(:time_divisor) { 3600 }

          context "(0 second)" do
            let(:time_delta) { 0 }

            it { is_expected.to eq generated_token2 }
          end

          context "(3600 seconds)" do
            let(:time_delta) { 3600 }

            it { is_expected.to_not eq generated_token2 }
          end
        end
      end
    end

    let(:generated_token) do
      described_class.generate_token(nonce)
    end

    it "generates a token" do
      expect(generated_token).not_to be nil
    end

    context "without a secret_key" do
      before do
        @old_secret_key = RailsEncryptedToken::Token::Web.secret_key
        RailsEncryptedToken::Token::Web.secret_key = ""
      end

      after do
        RailsEncryptedToken::Token::Web.secret_key = @old_secret_key
      end

      it "raises KeyNotFoundError" do
        expect do
          described_class.generate_token(nonce)
        end.to raise_error described_class::KeyNotFoundError
      end
    end
  end

  describe ".verify_token" do
    context "with result from .generate_token" do
      let(:nonce) { "nonce1" }
      let(:generated_token) do
        described_class.generate_token(nonce)
      end

      it { is_expected.to be_token_valid(nonce, generated_token) }

      context "without a secret_key" do
        before do
          generated_token
          @old_secret_key = RailsEncryptedToken::Token::Web.secret_key
          RailsEncryptedToken::Token::Web.secret_key = ""
        end

        after do
          RailsEncryptedToken::Token::Web.secret_key = @old_secret_key
        end

        it "raises KeyNotFoundError" do
          expect do
            described_class.token_valid?(nonce, generated_token)
          end.to raise_error described_class::KeyNotFoundError
        end
      end
    end

    context "with result modified from .generate_token" do
      let(:nonce) { "nonce1" }

      context "when a space char is appended to the token" do
        let(:generated_token) do
          "#{described_class.generate_token(nonce)} "
        end

        it { is_expected.to_not be_token_valid(nonce, generated_token) }
      end

      [
        19238471239487129128347123894712,
        { a: "b" },
        [1, 3],
        Object.new,
      ].each do |object|
        context "when token is a #{object.class}" do
          let(:generated_token) do
            object
          end

          it { is_expected.to_not be_token_valid(nonce, generated_token) }
        end
      end
    end

    describe "time of verification" do
      subject { described_class }
      let(:nonce) { "nonce1" }

      let(:generated_token) do
        described_class.generate_token(nonce)
      end

      let(:generation_time) do
        Time.local(2008, 9, 1, 10, 5, 0)
      end

      before do
        Timecop.freeze(generation_time)
        generated_token
        Timecop.freeze(generation_time + time_delta)
      end

      after do
        Timecop.return
      end

      context "is just before the limit" do
        let(:time_delta) { 3599 }

        it { is_expected.to be_token_valid(nonce, generated_token) }
      end

      context "is just after the limit" do
        let(:time_delta) { 3600 }

        it { is_expected.to_not be_token_valid(nonce, generated_token) }
      end

      context "is way after the limit" do
        let(:time_delta) { 1 << 512 }

        it { is_expected.to_not be_token_valid(nonce, generated_token) }
      end

      context "is before the generation_time" do
        let(:time_delta) { -1 }

        it { is_expected.to_not be_token_valid(nonce, generated_token) }
      end
    end
  end
end
