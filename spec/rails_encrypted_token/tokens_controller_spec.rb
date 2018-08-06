require "spec_helper"

Rspec.describe RailsEncryptedToken::TokensController, type: :controller do

  describe ".csrf_token" do
    let(:action) do
      proc { get :csrf_token }
    end

    let(:request_header) do
      {}
    end

    let(:json) do
      JSON.parse(response.body)
    end

    shared_examples_for "valid tokens" do
      let(:request_header) do
        {
          'X-Initial-Nonce' => 'some random nonce'
        }
      end

      it "succeeds" do
        expect(response.status).to eq 200
      end

      it "returns a valid token" do
        expect(json).to_not be_nil
      end
    end

    context "with a valid nonce" do
      context "without an identity" do
      end

      context "with an identity" do
        it "returns a valid token"
      end
    end

    context "with an invalid nonce" do
      it "returns 400" do
        expect(response.status).to eq 400
      end
    end

    context "without a nonce" do
      it "returns 400" do
        expect(response.status).to eq 400
      end
    end
  end
end
