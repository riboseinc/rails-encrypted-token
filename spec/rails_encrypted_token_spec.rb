require "spec_helper"

RSpec.describe RailsEncryptedToken do
  it "has a version number" do
    expect(RailsEncryptedToken::VERSION).not_to be nil
  end
end

class ApplicationController < ActionController::Base
  class AccessDenied < StandardError; end

  rescue_from AccessDenied, with: :access_denied

  private

  def access_denied
    redirect_to "/401.html"
  end
end

RSpec.describe ApplicationController, type: :controller do

  controller do
    def index
      render json: { a: 3 }
    end

    def test
      render json: { hello: 6 }
    end
  end

  before do
  end

  it "gets test" do
    routes.draw { get "test" => "anonymous#test" }
    get :test
    expect(response).to be_successful
  end

  it "gets" do
    get :index
    expect(response).to be_successful
  end

end
