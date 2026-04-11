const bcrypt = require('bcrypt');

const password = "imroot@121"; // choose your password

bcrypt.hash(password, 10).then(hash => {
  console.log("Hashed password:");
  console.log(hash);
});