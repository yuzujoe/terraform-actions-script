resource "aws_instance" "example" {
  ami           = "amazon"
  instance_type = "t2.micro"

  tags = {
    Name = "actions-sample-1"
  }
}
