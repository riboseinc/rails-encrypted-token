module RailsEncryptedToken
  class Engine < ::Rails::Engine

    engine_name "rails_encrypted_token"

    initializer "rails_encrypted_token.assets.precompile" do |app|
      app.config.assets.precompile << "rails_encrypted_token/manifest"
      app.config.assets.paths << "src"
    end
  end
end
